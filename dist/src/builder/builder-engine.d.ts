import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
export declare function hashPackage(pkg: BuilderPackage): string;
/**
 * Template-based builder for the first integration phase.
 * Generates file manifests based on the BuilderPackage without calling an LLM.
 * This proves the pipeline works end-to-end before adding AI code generation.
 */
export declare class TemplateBuilder {
    build(jobId: string, pkg: BuilderPackage): Promise<BuilderRunRecord>;
    private generateFileManifest;
    private runTestStubs;
}
