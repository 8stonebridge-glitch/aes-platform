import { StateGraph, END } from "@langchain/langgraph";
import { AESState, type AESStateType } from "./state.js";
import { intake } from "./nodes/intake.js";
import { intentClassifier } from "./nodes/intent-classifier.js";
import { intentConfirmer } from "./nodes/intent-confirmer.js";
import { decomposer } from "./nodes/decomposer.js";
import { designer } from "./nodes/designer.js";
import { specValidator } from "./nodes/spec-validator.js";
import { userApproval } from "./nodes/user-approval.js";
import { catalogSearcher } from "./nodes/catalog-searcher.js";
import { bridgeCompiler } from "./nodes/bridge-compiler.js";
import { vetoChecker } from "./nodes/veto-checker.js";
import { builderDispatcher } from "./nodes/builder-dispatcher.js";
import { validatorRunner } from "./nodes/validator-runner.js";
import { deploymentHandler } from "./nodes/deployment-handler.js";
import { graphUpdater, failureRecorder } from "./nodes/graph-updater.js";
import { graphReader } from "./nodes/graph-reader.js";
import { researchNode } from "./nodes/research-node.js";
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
  onNeedsConfirmation: (statement: string, questions?: string[]) => Promise<boolean>;
}

// Per-job callbacks map — eliminates race condition when concurrent builds run
const _callbacksMap = new Map<string, GraphCallbacks>();
let _activeJobId: string | null = null;

export function getCallbacks(): GraphCallbacks | null {
  if (_activeJobId) return _callbacksMap.get(_activeJobId) ?? null;
  // Fallback: return the most recently registered callbacks
  const entries = [..._callbacksMap.values()];
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function getCallbacksForJob(jobId: string): GraphCallbacks | null {
  return _callbacksMap.get(jobId) ?? null;
}

export function setActiveJob(jobId: string): void {
  _activeJobId = jobId;
}

function routeAfterIntake(state: AESStateType): string {
  if (state.errorMessage) return "failure_recorder";
  return "graph_reader";
}

function routeAfterClassifier(state: AESStateType): string {
  if (state.errorMessage) return "failure_recorder";
  if (!state.intentBrief) return "failure_recorder";

  const brief = state.intentBrief;

  // Auto-confirm if low ambiguity + low risk + zero flags
  if (
    brief.ambiguity_flags.length === 0 &&
    brief.inferred_risk_class === "low"
  ) {
    return "research"; // Research before decomposition
  }

  // Needs confirmation first
  return "intent_confirmer";
}

function routeAfterConfirmer(state: AESStateType): string {
  if (!state.intentConfirmed) return "failure_recorder";
  return "research"; // Research before decomposition
}

function routeAfterSpecValidator(state: AESStateType): string {
  const failed = (state.specValidationResults || []).filter((r: any) => !r.passed);
  if (failed.length > 0) {
    // Retry or fail
    if ((state.specRetryCount || 0) >= 3) return "failure_recorder";
    return "decomposer"; // Re-derive
  }
  return "user_approval";
}

function routeAfterUserApproval(state: AESStateType): string {
  if (!state.userApproved) return "failure_recorder";
  return "catalog_searcher";
}

function routeAfterVetoChecker(state: AESStateType): string {
  if (state.errorMessage) return "failure_recorder";
  return "graph_updater_pre_build";
}

function routeAfterBuilderDispatcher(state: AESStateType): string {
  if (state.errorMessage) return "failure_recorder";
  return "validator_runner";
}

function routeAfterValidatorRunner(state: AESStateType): string {
  if (state.errorMessage) return "failure_recorder";
  return "deployment_handler";
}

function routeAfterDeploymentHandler(state: AESStateType): string {
  if (state.errorMessage && state.currentGate === ("failed" as any)) return "failure_recorder";
  return "graph_updater_post_deploy"; // Write build record to Neo4j, then end
}

export function buildAESGraph() {
  const graph = new StateGraph(AESState) as any;

  // Gate 0 nodes
  graph.addNode("intake", intake);
  graph.addNode("graph_reader", graphReader);
  graph.addNode("intent_classifier", intentClassifier);
  graph.addNode("intent_confirmer", intentConfirmer);

  // Research node (between classification and decomposition)
  graph.addNode("research", researchNode);

  // Gate 1 nodes
  graph.addNode("decomposer", decomposer);
  graph.addNode("designer", designer);
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

  // Failure recorder — lightweight node that persists PipelineOutcome on early exits
  graph.addNode("failure_recorder", failureRecorder);

  // Entry
  graph.addEdge("__start__", "intake");

  // Gate 0 routing
  graph.addConditionalEdges("intake", routeAfterIntake);
  graph.addEdge("graph_reader", "intent_classifier");
  graph.addConditionalEdges("intent_classifier", routeAfterClassifier);
  graph.addConditionalEdges("intent_confirmer", routeAfterConfirmer);

  // Research → Decomposer
  graph.addEdge("research", "decomposer");

  // Gate 1 routing: decomposer → designer → spec_validator
  graph.addEdge("decomposer", "designer");
  graph.addEdge("designer", "spec_validator");
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

  // Failure recorder: persist outcome → end
  graph.addEdge("failure_recorder", "__end__");

  return graph.compile();
}

// Main entry point for running the graph
export async function runGraph(
  input: {
    jobId: string;
    requestId: string;
    rawRequest: string;
    currentGate: "gate_0";
    targetPath?: string | null;
    deployTarget?: "local" | "cloudflare";
    designMode?: "auto" | "paper";
  },
  callbacks: GraphCallbacks
): Promise<AESStateType> {
  _callbacksMap.set(input.jobId, callbacks);
  _activeJobId = input.jobId;

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
    targetPath: input.targetPath ?? null,
    deployTarget: input.deployTarget ?? "local",
    durability: store.hasPersistence() ? "persisted" : "memory_only",
    createdAt: new Date().toISOString(),
  });

  // Build graph fresh per invocation to avoid state leaks between runs
  const graph = buildAESGraph();

  // Run the graph with error boundary to ensure cleanup
  let result: AESStateType;
  try {
    result = await graph.invoke({
      jobId: input.jobId,
      requestId: input.requestId,
      rawRequest: input.rawRequest,
      currentGate: "gate_0",
      targetPath: input.targetPath ?? null,
      deployTarget: input.deployTarget ?? "local",
      designMode: input.designMode ?? "auto",
    });
  } catch (err: any) {
    // Ensure cleanup even on unhandled graph errors
    _callbacksMap.delete(input.jobId);
    if (_activeJobId === input.jobId) _activeJobId = null;
    const neo4jSvc = getNeo4jService();
    if (neo4jSvc.isConnected()) {
      await neo4jSvc.close().catch(() => {});
    }
    // Mark job as failed in store
    store.update(input.jobId, {
      currentGate: "failed",
      errorMessage: `Pipeline error: ${err.message}`,
    } as any);
    throw err;
  }

  // Update store with final state
  store.update(input.jobId, result);

  // Clean up Neo4j connection
  const neo4jSvc = getNeo4jService();
  if (neo4jSvc.isConnected()) {
    await neo4jSvc.close().catch(() => {});
  }

  _callbacksMap.delete(input.jobId);
  if (_activeJobId === input.jobId) _activeJobId = null;
  return result;
}
