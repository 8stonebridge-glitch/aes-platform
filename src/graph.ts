import { StateGraph, END } from "@langchain/langgraph";
import { AESState, type AESStateType } from "./state.js";
import { intake } from "./nodes/intake.js";
import { intentClassifier } from "./nodes/intent-classifier.js";
import { intentConfirmer } from "./nodes/intent-confirmer.js";
import { decomposer } from "./nodes/decomposer.js";
import { specValidator } from "./nodes/spec-validator.js";
import { userApproval } from "./nodes/user-approval.js";
import { catalogSearcher } from "./nodes/catalog-searcher.js";
import { bridgeCompiler } from "./nodes/bridge-compiler.js";
import { vetoChecker } from "./nodes/veto-checker.js";
import { builderDispatcher } from "./nodes/builder-dispatcher.js";
import { validatorRunner } from "./nodes/validator-runner.js";
import { deploymentHandler } from "./nodes/deployment-handler.js";
import { graphUpdater } from "./nodes/graph-updater.js";
import { graphReader } from "./nodes/graph-reader.js";
import { getJobStore } from "./store.js";
import { getNeo4jService } from "./services/neo4j-service.js";

// @ts-nocheck — LangGraph's generic types for addNode/addEdge are strict about
// literal string unions. We use `as any` on graph builder methods since the
// node names are dynamic and validated at runtime by LangGraph.

// Callbacks for CLI/UI streaming
export interface GraphCallbacks {
  onGate: (gate: string, message: string) => void;
  onStep: (message: string) => void;
  onSuccess: (message: string) => void;
  onFail: (message: string) => void;
  onWarn: (message: string) => void;
  onPause: (message: string) => void;
  onFeatureStatus: (id: string, name: string, status: string) => void;
  onNeedsApproval: (prompt: string, data: any) => Promise<boolean>;
  onNeedsConfirmation: (statement: string) => Promise<boolean>;
}

// Global callbacks reference for nodes to use
let _callbacks: GraphCallbacks | null = null;
export function getCallbacks(): GraphCallbacks | null {
  return _callbacks;
}

function routeAfterIntake(state: AESStateType): string {
  if (state.errorMessage) return "__end__";
  return "graph_reader";
}

function routeAfterClassifier(state: AESStateType): string {
  if (state.errorMessage) return "__end__";
  if (!state.intentBrief) return "__end__";

  const brief = state.intentBrief;

  // Auto-confirm if low ambiguity + low risk + zero flags
  if (
    brief.ambiguity_flags.length === 0 &&
    brief.inferred_risk_class === "low"
  ) {
    return "decomposer";
  }

  // Needs confirmation
  return "intent_confirmer";
}

function routeAfterConfirmer(state: AESStateType): string {
  if (!state.intentConfirmed) return "__end__";
  return "decomposer";
}

function routeAfterSpecValidator(state: AESStateType): string {
  const failed = (state.specValidationResults || []).filter((r: any) => !r.passed);
  if (failed.length > 0) {
    // Retry or fail
    if ((state.specRetryCount || 0) >= 3) return "__end__";
    return "decomposer"; // Re-derive
  }
  return "user_approval";
}

function routeAfterUserApproval(state: AESStateType): string {
  if (!state.userApproved) return "__end__";
  return "catalog_searcher";
}

function routeAfterVetoChecker(state: AESStateType): string {
  if (state.errorMessage) return "__end__";
  return "graph_updater_pre_build";
}

function routeAfterBuilderDispatcher(state: AESStateType): string {
  if (state.errorMessage) return "__end__";
  return "validator_runner";
}

function routeAfterValidatorRunner(state: AESStateType): string {
  if (state.errorMessage) return "__end__";
  return "deployment_handler";
}

function routeAfterDeploymentHandler(_state: AESStateType): string {
  return "graph_updater_post_deploy"; // Write build record to Neo4j, then end
}

export function buildAESGraph() {
  const graph = new StateGraph(AESState) as any;

  // Gate 0 nodes
  graph.addNode("intake", intake);
  graph.addNode("graph_reader", graphReader);
  graph.addNode("intent_classifier", intentClassifier);
  graph.addNode("intent_confirmer", intentConfirmer);

  // Gate 1 nodes
  graph.addNode("decomposer", decomposer);
  graph.addNode("spec_validator", specValidator);
  graph.addNode("user_approval", userApproval);

  // Gate 2 + 3 nodes
  graph.addNode("catalog_searcher", catalogSearcher);
  graph.addNode("bridge_compiler", bridgeCompiler);
  graph.addNode("veto_checker", vetoChecker);

  // Gate 4 + 5 nodes (build + validate)
  graph.addNode("builder_dispatcher", builderDispatcher);
  graph.addNode("validator_runner", validatorRunner);

  // Gate 6: Deployment
  graph.addNode("deployment_handler", deploymentHandler);

  // Graph updater nodes (Neo4j side-effect — never blocks pipeline)
  graph.addNode("graph_updater_pre_build", graphUpdater);
  graph.addNode("graph_updater_post_deploy", graphUpdater);

  // Entry
  graph.addEdge("__start__", "intake");

  // Gate 0 routing
  graph.addConditionalEdges("intake", routeAfterIntake);
  graph.addEdge("graph_reader", "intent_classifier");
  graph.addConditionalEdges("intent_classifier", routeAfterClassifier);
  graph.addConditionalEdges("intent_confirmer", routeAfterConfirmer);

  // Gate 1 routing
  graph.addEdge("decomposer", "spec_validator");
  graph.addConditionalEdges("spec_validator", routeAfterSpecValidator);
  graph.addConditionalEdges("user_approval", routeAfterUserApproval);

  // Gate 2 + 3 routing
  graph.addEdge("catalog_searcher", "bridge_compiler");
  graph.addEdge("bridge_compiler", "veto_checker");
  graph.addConditionalEdges("veto_checker", routeAfterVetoChecker);

  // Graph updater (pre-build): gates 0-3 results → then builder
  graph.addEdge("graph_updater_pre_build", "builder_dispatcher");

  // Gate 4 + 5 + 6 routing (build → validate → deploy → graph update → end)
  graph.addConditionalEdges("builder_dispatcher", routeAfterBuilderDispatcher);
  graph.addConditionalEdges("validator_runner", routeAfterValidatorRunner);
  graph.addConditionalEdges("deployment_handler", routeAfterDeploymentHandler);

  // Graph updater (post-deploy): build record → end
  graph.addEdge("graph_updater_post_deploy", "__end__");

  return graph.compile();
}

// Main entry point for running the graph
export async function runGraph(
  input: {
    jobId: string;
    requestId: string;
    rawRequest: string;
    currentGate: "gate_0";
  },
  callbacks: GraphCallbacks
): Promise<AESStateType> {
  _callbacks = callbacks;

  // Initialize persistence if Postgres is available
  const store = getJobStore();
  if (!store.hasPersistence()) {
    const pgUrl = process.env.AES_POSTGRES_URL;
    if (pgUrl) {
      try {
        const { PersistenceLayer } = await import("./persistence.js");
        const persistence = new PersistenceLayer(pgUrl);
        await persistence.initialize();
        store.setPersistence(persistence);
      } catch (err: any) {
        // Postgres unavailable — continue in-memory only
        callbacks.onWarn?.(`Postgres unavailable: ${err.message} — running in-memory only`);
      }
    }
  }

  store.create({
    jobId: input.jobId,
    requestId: input.requestId,
    rawRequest: input.rawRequest,
    currentGate: input.currentGate,
    durability: store.hasPersistence() ? "memory_only" : "memory_only",
    createdAt: new Date().toISOString(),
  });

  const graph = buildAESGraph();

  // Run the graph
  const result = await graph.invoke({
    jobId: input.jobId,
    requestId: input.requestId,
    rawRequest: input.rawRequest,
    currentGate: "gate_0",
  });

  // Update store with final state
  store.update(input.jobId, result);

  // Clean up Neo4j connection
  const neo4jSvc = getNeo4jService();
  if (neo4jSvc.isConnected()) {
    await neo4jSvc.close().catch(() => {});
  }

  _callbacks = null;
  return result;
}
