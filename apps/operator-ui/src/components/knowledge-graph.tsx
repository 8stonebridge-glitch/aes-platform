"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, type GraphData } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  LearnedApp: "#1c1917",
  LearnedFeature: "#2563eb",
  LearnedModel: "#7c3aed",
  LearnedIntegration: "#059669",
  LearnedUI: "#d97706",
};

export function KnowledgeGraph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api.graphVisualize("full", 300);
      setData(d);
      setError(d.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-[var(--text-muted)]">
        Loading knowledge graph...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <p className="text-sm text-[var(--red)]">{error ?? "No data"}</p>
        <button
          onClick={load}
          className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-xs text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter nodes by search
  const filteredNodes = search
    ? data.nodes.filter((n) =>
        n.label.toLowerCase().includes(search.toLowerCase())
      )
    : data.nodes;
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data.edges.filter(
    (e) => filteredIds.has(e.source) && filteredIds.has(e.target)
  );

  // Layout: simple force-ish grid
  const nodes: Node[] = filteredNodes.map((n, i) => {
    const cols = Math.ceil(Math.sqrt(filteredNodes.length));
    const row = Math.floor(i / cols);
    const col = i % cols;
    const isApp = n.type === "LearnedApp";
    const color = TYPE_COLORS[n.type] ?? "#a8a29e";

    return {
      id: n.id,
      position: { x: col * 180 + Math.random() * 20, y: row * 120 + Math.random() * 20 },
      data: { label: n.label },
      style: {
        background: isApp ? color : "#fff",
        color: isApp ? "#fff" : color,
        border: `2px solid ${color}`,
        borderRadius: isApp ? "12px" : "8px",
        padding: isApp ? "10px 18px" : "6px 12px",
        fontSize: isApp ? "13px" : "10px",
        fontWeight: isApp ? 700 : 500,
      },
    };
  });

  const edges: Edge[] = filteredEdges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    type: "default",
    style: {
      stroke: e.type === "SIMILAR_TO" ? "#d97706" : "#d6d3d1",
      strokeWidth: e.type === "SIMILAR_TO" ? 1.5 : 1,
      opacity: 0.5,
    },
  }));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">
          {data.total_nodes} nodes &middot; {data.total_edges} edges
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: color }}
            />
            <span className="text-[var(--text-muted)]">
              {type.replace("Learned", "")}
            </span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div className="h-[500px] w-full overflow-hidden rounded-lg border border-[var(--border)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={24} size={1} color="var(--border)" />
          <Controls
            showInteractive={false}
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
