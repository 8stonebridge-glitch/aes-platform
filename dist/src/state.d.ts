export declare const AESState: import("@langchain/langgraph").AnnotationRoot<{
    jobId: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    requestId: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    targetPath: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
    deployTarget: import("@langchain/langgraph").BaseChannel<"local" | "cloudflare" | "vercel", "local" | "cloudflare" | "vercel" | import("@langchain/langgraph").OverwriteValue<"local" | "cloudflare" | "vercel">, unknown>;
    autonomous: import("@langchain/langgraph").BaseChannel<boolean, boolean | import("@langchain/langgraph").OverwriteValue<boolean>, unknown>;
    previewUrl: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
    currentGate: {
        (annotation: import("@langchain/langgraph").SingleReducer<"gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed", "gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed">): import("@langchain/langgraph").BaseChannel<"gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed", "gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed" | import("@langchain/langgraph").OverwriteValue<"gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed">, unknown>;
        (): import("@langchain/langgraph").LastValue<"gate_0" | "gate_1" | "gate_2" | "gate_3" | "gate_4" | "gate_5" | "research" | "validation" | "building" | "deploying" | "complete" | "failed">;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    rawRequest: {
        (annotation: import("@langchain/langgraph").SingleReducer<string, string>): import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
        (): import("@langchain/langgraph").LastValue<string>;
        Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
    };
    intentBrief: import("@langchain/langgraph").BaseChannel<any, any, unknown>;
    intentConfirmed: import("@langchain/langgraph").BaseChannel<boolean, boolean | import("@langchain/langgraph").OverwriteValue<boolean>, unknown>;
    appSpec: import("@langchain/langgraph").BaseChannel<any, any, unknown>;
    specValidationResults: import("@langchain/langgraph").BaseChannel<any[], any[] | import("@langchain/langgraph").OverwriteValue<any[]>, unknown>;
    specRetryCount: import("@langchain/langgraph").BaseChannel<number, number | import("@langchain/langgraph").OverwriteValue<number>, unknown>;
    userApproved: import("@langchain/langgraph").BaseChannel<boolean, boolean | import("@langchain/langgraph").OverwriteValue<boolean>, unknown>;
    currentFeatureId: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
    featureBridges: import("@langchain/langgraph").BaseChannel<Record<string, any>, Record<string, any> | import("@langchain/langgraph").OverwriteValue<Record<string, any>>, unknown>;
    reusableSourceFiles: import("@langchain/langgraph").BaseChannel<Record<string, {
        repo: string;
        path: string;
        files: {
            path: string;
            content: string;
        }[];
    }>, Record<string, {
        repo: string;
        path: string;
        files: {
            path: string;
            content: string;
        }[];
    }> | import("@langchain/langgraph").OverwriteValue<Record<string, {
        repo: string;
        path: string;
        files: {
            path: string;
            content: string;
        }[];
    }>>, unknown>;
    featureBuildOrder: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
    featureBuildIndex: import("@langchain/langgraph").BaseChannel<number, number | import("@langchain/langgraph").OverwriteValue<number>, unknown>;
    vetoResults: import("@langchain/langgraph").BaseChannel<any[], any[] | import("@langchain/langgraph").OverwriteValue<any[]>, unknown>;
    buildResults: import("@langchain/langgraph").BaseChannel<Record<string, any>, Record<string, any> | import("@langchain/langgraph").OverwriteValue<Record<string, any>>, unknown>;
    validatorResults: import("@langchain/langgraph").BaseChannel<Record<string, any>, Record<string, any> | import("@langchain/langgraph").OverwriteValue<Record<string, any>>, unknown>;
    fixTrailEntries: import("@langchain/langgraph").BaseChannel<any[], any[] | import("@langchain/langgraph").OverwriteValue<any[]>, unknown>;
    deploymentUrl: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
    graphContext: import("@langchain/langgraph").BaseChannel<{
        priorBuilds: any[];
        similarFeatures: any[];
        knownPatterns: any[];
        failureHistory: any[];
        reusableBridges: any[];
        learnedFeatures: any[];
        learnedModels: any[];
        learnedIntegrations: any[];
        learnedPatterns: any[];
        learnedFlows: any[];
        learnedResearch: any[];
        learnedCorrections: any[];
    }, {
        priorBuilds: any[];
        similarFeatures: any[];
        knownPatterns: any[];
        failureHistory: any[];
        reusableBridges: any[];
        learnedFeatures: any[];
        learnedModels: any[];
        learnedIntegrations: any[];
        learnedPatterns: any[];
        learnedFlows: any[];
        learnedResearch: any[];
        learnedCorrections: any[];
    } | import("@langchain/langgraph").OverwriteValue<{
        priorBuilds: any[];
        similarFeatures: any[];
        knownPatterns: any[];
        failureHistory: any[];
        reusableBridges: any[];
        learnedFeatures: any[];
        learnedModels: any[];
        learnedIntegrations: any[];
        learnedPatterns: any[];
        learnedFlows: any[];
        learnedResearch: any[];
        learnedCorrections: any[];
    }>, unknown>;
    designMode: import("@langchain/langgraph").BaseChannel<"auto" | "paper", "auto" | "paper" | import("@langchain/langgraph").OverwriteValue<"auto" | "paper">, unknown>;
    designEvidence: import("@langchain/langgraph").BaseChannel<any, any, unknown>;
    designBrief: import("@langchain/langgraph").BaseChannel<any, any, unknown>;
    errorMessage: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
    needsUserInput: import("@langchain/langgraph").BaseChannel<boolean, boolean | import("@langchain/langgraph").OverwriteValue<boolean>, unknown>;
    userInputPrompt: import("@langchain/langgraph").BaseChannel<string | null, string | import("@langchain/langgraph").OverwriteValue<string | null> | null, unknown>;
}>;
export type AESStateType = typeof AESState.State;
