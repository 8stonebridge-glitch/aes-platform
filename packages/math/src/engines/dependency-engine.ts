export interface DependencyNode {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "failed";
  dependencies: string[]; // IDs of nodes this depends on
}

export interface DependencyChain {
  path: string[]; // ordered IDs from root to leaf
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
  missing_prerequisites: { node_id: string; missing_dep: string }[];
  circular_dependencies: string[][];
  critical_path: DependencyChain;
  impact_map: Record<string, ImpactRadius>;
  build_order: string[];
  completeness_score: number; // 0-1
}

export function analyzeDependencies(nodes: DependencyNode[]): DependencyAnalysis {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Find missing prerequisites
  const missing: { node_id: string; missing_dep: string }[] = [];
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      if (!nodeMap.has(dep)) {
        missing.push({ node_id: node.id, missing_dep: dep });
      }
    }
  }

  // Detect circular dependencies using DFS
  const circular: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string, path: string[]): void {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      circular.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(id)) return;

    visited.add(id);
    inStack.add(id);
    path.push(id);

    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (nodeMap.has(dep)) dfs(dep, [...path]);
      }
    }

    inStack.delete(id);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) dfs(node.id, []);
  }

  // Topological sort for build order
  const buildOrder: string[] = [];
  const tempVisited = new Set<string>();
  const permVisited = new Set<string>();

  function topoSort(id: string): void {
    if (permVisited.has(id)) return;
    if (tempVisited.has(id)) return; // circular — skip
    tempVisited.add(id);
    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (nodeMap.has(dep)) topoSort(dep);
      }
    }
    tempVisited.delete(id);
    permVisited.add(id);
    buildOrder.push(id);
  }

  for (const node of nodes) topoSort(node.id);

  // Compute impact radius for each node
  const dependentMap = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      if (!dependentMap.has(dep)) dependentMap.set(dep, new Set());
      dependentMap.get(dep)!.add(node.id);
    }
  }

  function getTransitiveDependents(id: string, seen = new Set<string>()): string[] {
    const direct = dependentMap.get(id) || new Set();
    const all: string[] = [];
    for (const dep of direct) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      all.push(dep);
      all.push(...getTransitiveDependents(dep, seen));
    }
    return all;
  }

  const impactMap: Record<string, ImpactRadius> = {};
  for (const node of nodes) {
    const direct = [...(dependentMap.get(node.id) || [])];
    const transitive = getTransitiveDependents(node.id);
    const total = new Set([...direct, ...transitive]).size;
    impactMap[node.id] = {
      node_id: node.id,
      direct_dependents: direct,
      transitive_dependents: [...new Set(transitive)],
      total_impact: total,
      risk_level: total === 0 ? "low" : total <= 2 ? "medium" : total <= 5 ? "high" : "critical",
    };
  }

  // Find critical path (longest dependency chain)
  function longestChain(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node || node.dependencies.length === 0) return [id];

    let longest: string[] = [];
    for (const dep of node.dependencies) {
      if (nodeMap.has(dep)) {
        const chain = longestChain(dep, new Set(visited));
        if (chain.length > longest.length) longest = chain;
      }
    }
    return [...longest, id];
  }

  let criticalPath: string[] = [];
  for (const node of nodes) {
    const chain = longestChain(node.id);
    if (chain.length > criticalPath.length) criticalPath = chain;
  }

  const resolved = nodes.filter(n => n.status === "completed").length;
  const blocked = nodes.filter(n => n.status === "blocked").length;

  return {
    total_nodes: nodes.length,
    resolved_count: resolved,
    blocked_count: blocked,
    missing_prerequisites: missing,
    circular_dependencies: circular,
    critical_path: {
      path: criticalPath,
      length: criticalPath.length,
      all_resolved: criticalPath.every(id => nodeMap.get(id)?.status === "completed"),
      blocking_node: criticalPath.find(id => nodeMap.get(id)?.status === "blocked") || null,
    },
    impact_map: impactMap,
    build_order: buildOrder,
    completeness_score: nodes.length > 0 ? Math.round(resolved / nodes.length * 1000) / 1000 : 1,
  };
}
