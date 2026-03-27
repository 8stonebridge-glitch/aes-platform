import { Annotation } from "@langchain/langgraph";

// AES v12 Orchestrator State
// This is the state shape that flows through the entire LangGraph graph.

// Last-write-wins reducer for use with defaults
function lastValue<T>(_current: T, updated: T): T {
  return updated;
}

export const AESState = Annotation.Root({
  // Job identity
  jobId: Annotation<string>,
  requestId: Annotation<string>,

  // Target output path — where the built app files go
  targetPath: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),

  // Deploy target: "local" (write to disk) or "cloudflare" (Dynamic Workers)
  deployTarget: Annotation<"local" | "cloudflare">({
    value: lastValue,
    default: () => "local",
  }),

  // Cloudflare deploy result
  previewUrl: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),

  // Current phase
  currentGate: Annotation<
    | "gate_0"
    | "gate_1"
    | "gate_2"
    | "gate_3"
    | "gate_4"
    | "gate_5"
    | "building"
    | "deploying"
    | "complete"
    | "failed"
  >,

  // Gate 0
  rawRequest: Annotation<string>,
  intentBrief: Annotation<any | null>({
    value: lastValue,
    default: () => null,
  }),
  intentConfirmed: Annotation<boolean>({
    value: lastValue,
    default: () => false,
  }),

  // Gate 1
  appSpec: Annotation<any | null>({
    value: lastValue,
    default: () => null,
  }),
  specValidationResults: Annotation<any[]>({
    value: lastValue,
    default: () => [],
  }),
  specRetryCount: Annotation<number>({
    value: lastValue,
    default: () => 0,
  }),
  userApproved: Annotation<boolean>({
    value: lastValue,
    default: () => false,
  }),

  // Gate 2 (per feature)
  currentFeatureId: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),
  featureBridges: Annotation<Record<string, any>>({
    value: lastValue,
    default: () => ({}),
  }),
  featureBuildOrder: Annotation<string[]>({
    value: lastValue,
    default: () => [],
  }),
  featureBuildIndex: Annotation<number>({
    value: lastValue,
    default: () => 0,
  }),

  // Gate 3
  vetoResults: Annotation<any[]>({
    value: lastValue,
    default: () => [],
  }),

  // Building
  buildResults: Annotation<Record<string, any>>({
    value: lastValue,
    default: () => ({}),
  }),
  validatorResults: Annotation<Record<string, any>>({
    value: lastValue,
    default: () => ({}),
  }),

  // Gate 5
  fixTrailEntries: Annotation<any[]>({
    value: lastValue,
    default: () => [],
  }),

  // Deployment
  deploymentUrl: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),

  // Graph context — prior knowledge from Neo4j loaded at start
  graphContext: Annotation<{
    priorBuilds: any[];
    similarFeatures: any[];
    knownPatterns: any[];
    failureHistory: any[];
    reusableBridges: any[];
    // Learned knowledge layer (from codebase scanning + Perplexity research)
    learnedFeatures: any[];
    learnedModels: any[];
    learnedIntegrations: any[];
    learnedPatterns: any[];
    learnedFlows: any[];
    learnedResearch: any[];
    learnedCorrections: any[];
  }>({
    value: lastValue,
    default: () => ({
      priorBuilds: [],
      similarFeatures: [],
      knownPatterns: [],
      failureHistory: [],
      reusableBridges: [],
      learnedFeatures: [],
      learnedModels: [],
      learnedIntegrations: [],
      learnedPatterns: [],
      learnedFlows: [],
      learnedResearch: [],
      learnedCorrections: [],
    }),
  }),

  // Control
  errorMessage: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),
  needsUserInput: Annotation<boolean>({
    value: lastValue,
    default: () => false,
  }),
  userInputPrompt: Annotation<string | null>({
    value: lastValue,
    default: () => null,
  }),
});

export type AESStateType = typeof AESState.State;
