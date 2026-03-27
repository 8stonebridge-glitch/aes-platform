"use client";

import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { OrchestratorFeature } from "@/lib/api";

const STAGE_COLORS: Record<string, string> = {
  research: "#2563eb",
  plan: "#d97706",
  approve: "#d97706",
  build: "#d97706",
  verify: "#16a34a",
  complete: "#16a34a",
  failed: "#dc2626",
};

interface DependencyGraphProps {
  features: OrchestratorFeature[];
}

export function DependencyGraph({ features }: DependencyGraphProps) {
  if (features.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-[var(--text-muted)]">
        No features yet
      </div>
    );
  }

  // Simple layout: arrange features in rows by dependency depth
  const depths = computeDepths(features);
  const maxDepth = Math.max(...Object.values(depths), 0);

  // Group by depth
  const byDepth: Record<number, OrchestratorFeature[]> = {};
  for (const f of features) {
    const d = depths[f.feature_id] ?? 0;
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d]!.push(f);
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (let depth = 0; depth <= maxDepth; depth++) {
    const group = byDepth[depth] ?? [];
    group.forEach((f, i) => {
      const x = depth * 220 + 40;
      const y = i * 100 + 40 + (group.length === 1 ? 50 : 0);
      const stageColor = STAGE_COLORS[f.stage] ?? "#a8a29e";

      nodes.push({
        id: f.feature_id,
        position: { x, y },
        data: { label: f.name },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: "#fff",
          border: `2px solid ${stageColor}`,
          borderRadius: "10px",
          padding: "10px 16px",
          fontSize: "12px",
          fontWeight: 600,
          color: "#1c1917",
          minWidth: "120px",
          textAlign: "center" as const,
        },
      });

      // Edges from dependencies
      for (const dep of f.dependencies) {
        edges.push({
          id: `${dep}->${f.feature_id}`,
          source: dep,
          target: f.feature_id,
          type: "smoothstep",
          animated: f.stage === "building" || f.stage === "executing",
          style: { stroke: "#d6d3d1", strokeWidth: 2 },
        });
      }
    });
  }

  return (
    <div className="h-72 w-full overflow-hidden rounded-lg border border-[var(--border)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        panOnScroll
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}

/* Compute depth of each feature based on dependencies */
function computeDepths(features: OrchestratorFeature[]): Record<string, number> {
  const depths: Record<string, number> = {};
  const ids = new Set(features.map((f) => f.feature_id));

  function getDepth(id: string, visited: Set<string> = new Set()): number {
    if (depths[id] !== undefined) return depths[id]!;
    if (visited.has(id)) return 0; // circular guard
    visited.add(id);

    const f = features.find((x) => x.feature_id === id);
    if (!f || f.dependencies.length === 0) {
      depths[id] = 0;
      return 0;
    }

    const maxDep = Math.max(
      ...f.dependencies
        .filter((d) => ids.has(d))
        .map((d) => getDepth(d, visited))
    );
    depths[id] = maxDep + 1;
    return depths[id]!;
  }

  for (const f of features) getDepth(f.feature_id);
  return depths;
}
