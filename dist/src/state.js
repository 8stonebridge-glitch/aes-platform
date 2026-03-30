import { Annotation } from "@langchain/langgraph";
// AES v12 Orchestrator State
// This is the state shape that flows through the entire LangGraph graph.
// Last-write-wins reducer for use with defaults
function lastValue(_current, updated) {
    return updated;
}
export const AESState = Annotation.Root({
    // Job identity
    jobId: (Annotation),
    requestId: (Annotation),
    // Target output path — where the built app files go
    targetPath: Annotation({
        value: lastValue,
        default: () => null,
    }),
    // Deploy target: "local", "cloudflare", or "vercel"
    deployTarget: Annotation({
        value: lastValue,
        default: () => "local",
    }),
    // Autonomous mode: skip manual confirm/approval pauses for unattended runs
    autonomous: Annotation({
        value: lastValue,
        default: () => false,
    }),
    // Cloudflare deploy result
    previewUrl: Annotation({
        value: lastValue,
        default: () => null,
    }),
    // Current phase
    currentGate: (Annotation),
    // Gate 0
    rawRequest: (Annotation),
    intentBrief: Annotation({
        value: lastValue,
        default: () => null,
    }),
    intentConfirmed: Annotation({
        value: lastValue,
        default: () => false,
    }),
    // Gate 1
    appSpec: Annotation({
        value: lastValue,
        default: () => null,
    }),
    specValidationResults: Annotation({
        value: lastValue,
        default: () => [],
    }),
    specRetryCount: Annotation({
        value: lastValue,
        default: () => 0,
    }),
    userApproved: Annotation({
        value: lastValue,
        default: () => false,
    }),
    // Gate 2 (per feature)
    currentFeatureId: Annotation({
        value: lastValue,
        default: () => null,
    }),
    featureBridges: Annotation({
        value: lastValue,
        default: () => ({}),
    }),
    // Fetched source files from GitHub keyed by candidate_id
    // Each entry: { repo, path, files: { path: string, content: string }[] }
    reusableSourceFiles: Annotation({
        value: lastValue,
        default: () => ({}),
    }),
    featureBuildOrder: Annotation({
        value: lastValue,
        default: () => [],
    }),
    featureBuildIndex: Annotation({
        value: lastValue,
        default: () => 0,
    }),
    // Gate 3
    vetoResults: Annotation({
        value: lastValue,
        default: () => [],
    }),
    // Building
    buildResults: Annotation({
        value: lastValue,
        default: () => ({}),
    }),
    validatorResults: Annotation({
        value: lastValue,
        default: () => ({}),
    }),
    // Gate 5
    fixTrailEntries: Annotation({
        value: lastValue,
        default: () => [],
    }),
    // Deployment
    deploymentUrl: Annotation({
        value: lastValue,
        default: () => null,
    }),
    // Graph context — prior knowledge from Neo4j loaded at start
    graphContext: Annotation({
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
    // Design mode: "auto" (generate evidence automatically) or "paper" (pause for Paper MCP)
    designMode: Annotation({
        value: lastValue,
        default: () => "auto",
    }),
    // Design evidence — loaded from Paper MCP extractions or auto-generated
    designEvidence: Annotation({
        value: lastValue,
        default: () => null,
    }),
    // Design brief — output by designer node for Paper MCP path
    designBrief: Annotation({
        value: lastValue,
        default: () => null,
    }),
    // Control
    errorMessage: Annotation({
        value: lastValue,
        default: () => null,
    }),
    needsUserInput: Annotation({
        value: lastValue,
        default: () => false,
    }),
    userInputPrompt: Annotation({
        value: lastValue,
        default: () => null,
    }),
});
