/**
 * LLM-powered code generation for AES features.
 *
 * Each function tries the LLM first; returns null when the model is
 * unavailable so the caller can fall back to its template path.
 */
interface FeatureContext {
    name: string;
    description: string;
    summary?: string;
    outcome: string;
    actor_ids?: string[];
    destructive_actions?: {
        action_name: string;
        reversible: boolean;
        confirmation_required: boolean;
        audit_logged: boolean;
    }[];
    audit_required?: boolean;
}
interface AppContext {
    title: string;
    summary: string;
    roles?: {
        role_id: string;
        name: string;
        description: string;
    }[];
    permissions?: {
        role_id: string;
        resource: string;
        effect: string;
    }[];
}
export declare function generateConvexSchema(feature: FeatureContext, appSpec: AppContext): Promise<string | null>;
export declare function generateConvexQueries(feature: FeatureContext, appSpec: AppContext, schemaContent: string): Promise<string | null>;
export declare function generateConvexMutations(feature: FeatureContext, appSpec: AppContext, schemaContent: string): Promise<string | null>;
export declare function generatePage(feature: FeatureContext, appSpec: AppContext, capability: string, pageType: "form" | "list" | "detail"): Promise<string | null>;
export declare function generateComponent(feature: FeatureContext, appSpec: AppContext, componentType: string): Promise<string | null>;
export declare function generateTest(feature: FeatureContext, testDef: {
    name: string;
    pass_condition: string;
}): Promise<string | null>;
/**
 * Generate code for a single feature part.
 * Uses a narrow, focused prompt instead of generating an entire file.
 * The part's prompt is already scoped to a specific concern
 * (e.g., "just the form body", "just the submit handler").
 */
export declare function generateFeaturePart(partPrompt: string, partKind: string): Promise<string | null>;
export {};
