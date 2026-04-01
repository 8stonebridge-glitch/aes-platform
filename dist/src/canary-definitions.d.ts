export interface CanaryDefinition {
    slug: string;
    title: string;
    description: string;
    exercisedPacks: string[];
}
export declare const CANARY_DEFINITIONS: Record<string, CanaryDefinition>;
