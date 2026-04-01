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

  // Deploy target: "local", "cloudflare", or "vercel"
  deployTarget: Annotation<"local" | "cloudflare" | "vercel">({
    value: lastValue,
    default: () => "local",
  }),

  // Autonomous mode: skip manual confirm/approval pauses for unattended runs
  autonomous: Annotation<boolean>({
    value: lastValue,
    default: () => false,
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
    | "research"
    | "validation"
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
  // Fetched source files from GitHub keyed by candidate_id
  // Each entry: { repo, path, files: { path: string, content: string }[] }
  reusableSourceFiles: Annotation<Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>>({
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
    // Build extraction intelligence (what prior builds discovered)
    buildExtractedModels: any[];
    buildExtractedIntegrations: any[];
    buildExtractedPatterns: any[];
    buildExtractedTech: any[];
    // Learned design/UI patterns
    learnedComponentPatterns: any[];
    learnedFormPatterns: any[];
    learnedNavigation: any[];
    learnedPageSections: any[];
    learnedStatePatterns: any[];
    learnedDesignSystems: any[];
    // Component relationship graph (dependencies, variants, loading/error states, pairs)
    componentRelationships: any[];
    // Failure memory intelligence
    preventionRules: any[];
    fixPatterns: any[];
    validatorHeuristics: any[];
    // Schema references
    convexSchemas: any[];
    referenceSchemas: any[];
    // AES meta-intelligence
    reasoningRules: any[];
    aesLessons: any[];
    aesBlueprints: any[];
    aesPreflight: any[];
    // Whole-app context (LearnedApp with relationships)
    learnedAppContext: any[];
    // Unified reasoner output (domain decomposition, beam search, blueprints)
    unifiedDomains: any[];
    unifiedDomainSources: any[];
    unifiedConceptScores: any[];
    unifiedBlueprint: string[];
    unifiedGaps: string[];
    unifiedCoverage: number;
    unifiedTracedPaths: string[];
    unifiedDiscoveredKnowledge: Record<string, string[]>;
    unifiedUniversalPatterns: any[];
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
      buildExtractedModels: [],
      buildExtractedIntegrations: [],
      buildExtractedPatterns: [],
      buildExtractedTech: [],
      learnedComponentPatterns: [],
      learnedFormPatterns: [],
      learnedNavigation: [],
      learnedPageSections: [],
      learnedStatePatterns: [],
      learnedDesignSystems: [],
      componentRelationships: [],
      preventionRules: [],
      fixPatterns: [],
      validatorHeuristics: [],
      convexSchemas: [],
      referenceSchemas: [],
      reasoningRules: [],
      aesLessons: [],
      aesBlueprints: [],
      aesPreflight: [],
      learnedAppContext: [],
      unifiedDomains: [],
      unifiedDomainSources: [],
      unifiedConceptScores: [],
      unifiedBlueprint: [],
      unifiedGaps: [],
      unifiedCoverage: 0,
      unifiedTracedPaths: [],
      unifiedDiscoveredKnowledge: {},
      unifiedUniversalPatterns: [],
    }),
  }),

  // Design mode: "auto" (generate evidence automatically) or "paper" (pause for Paper MCP)
  designMode: Annotation<"auto" | "paper">({
    value: lastValue,
    default: () => "auto",
  }),

  // Design evidence — loaded from Paper MCP extractions or auto-generated
  designEvidence: Annotation<any | null>({
    value: lastValue,
    default: () => null,
  }),

  // Design brief — output by designer node for Paper MCP path
  designBrief: Annotation<any | null>({
    value: lastValue,
    default: () => null,
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
