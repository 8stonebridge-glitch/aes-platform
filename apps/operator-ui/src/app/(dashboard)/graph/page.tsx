"use client";

import { KnowledgeGraph } from "@/components/knowledge-graph";

export default function GraphPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <KnowledgeGraph />
    </div>
  );
}
