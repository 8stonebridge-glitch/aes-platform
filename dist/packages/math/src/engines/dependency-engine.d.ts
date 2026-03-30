export interface DependencyNode {
    id: string;
    name: string;
    status: "pending" | "in_progress" | "completed" | "blocked" | "failed";
    dependencies: string[];
}
export interface DependencyChain {
    path: string[];
    length: number;
    all_resolved: boolean;
    blocking_node: string | null;
}
export interface ImpactRadius {
    node_id: string;
    direct_dependents: string[];
    transitive_dependents: string[];
    total_impact: number;
    risk_level: "low" | "medium" | "high" | "critical";
}
export interface DependencyAnalysis {
    total_nodes: number;
    resolved_count: number;
    blocked_count: number;
    missing_prerequisites: {
        node_id: string;
        missing_dep: string;
    }[];
    circular_dependencies: string[][];
    critical_path: DependencyChain;
    impact_map: Record<string, ImpactRadius>;
    build_order: string[];
    completeness_score: number;
}
export declare function analyzeDependencies(nodes: DependencyNode[]): DependencyAnalysis;
