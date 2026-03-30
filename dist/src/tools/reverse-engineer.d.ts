/**
 * Reverse Engineer — analyzes an existing codebase and writes learned
 * knowledge into Neo4j so AES can reuse it in future builds.
 *
 * Flow:
 *   1. Scan directory structure, package.json files, config files
 *   2. Extract: app metadata, features, data models, integrations, API routes, patterns
 *   3. Write everything to Neo4j as versioned entities
 *   4. Next pipeline run: graph-reader picks up this knowledge automatically
 *
 * Usage:
 *   npx tsx src/tools/reverse-engineer.ts /path/to/codebase
 */
interface AppAnalysis {
    name: string;
    description: string;
    appClass: string;
    techStack: TechStack;
    features: FeatureAnalysis[];
    dataModels: DataModel[];
    integrations: Integration[];
    apiRoutes: ApiRoute[];
    patterns: Pattern[];
    fileStructure: string[];
    packageCount: number;
    totalFiles: number;
}
interface TechStack {
    framework: string;
    language: string;
    runtime: string;
    database: string;
    orm: string;
    styling: string;
    testing: string;
    buildTool: string;
    monorepo: boolean;
    packages: string[];
}
interface FeatureAnalysis {
    id: string;
    name: string;
    description: string;
    directory: string;
    fileCount: number;
    dependencies: string[];
    hasTests: boolean;
    hasApi: boolean;
    complexity: "simple" | "moderate" | "complex";
}
interface DataModel {
    name: string;
    fields: string[];
    relations: string[];
    category: string;
}
interface Integration {
    name: string;
    type: string;
    provider: string;
    category: string;
}
interface ApiRoute {
    path: string;
    methods: string[];
    domain: string;
}
interface Pattern {
    name: string;
    type: string;
    description: string;
    evidence: string;
}
export declare function analyzeCodebase(rootDir: string): AppAnalysis;
export {};
