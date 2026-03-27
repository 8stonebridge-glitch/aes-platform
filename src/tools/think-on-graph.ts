/**
 * think-on-graph.ts — LLM-driven iterative graph exploration.
 *
 * Instead of one-shot keyword queries, the system:
 *   1. Starts at a seed node
 *   2. Looks at all outgoing edges
 *   3. Scores each edge for relevance to the request
 *   4. Follows the best edges (beam search)
 *   5. At each new node, repeats — discovers connected knowledge
 *   6. Builds a traced reasoning path with evidence at every hop
 *
 * Every fact in the final answer has an explicit graph path backing it.
 *
 * Usage:
 *   npx tsx src/tools/think-on-graph.ts "barber shop appointment booking app"
 *   npx tsx src/tools/think-on-graph.ts "AI-powered invoice management platform"
 */

import { getNeo4jService } from "../services/neo4j-service.js";

let neo4j: ReturnType<typeof getNeo4jService>;

async function q(cypher: string): Promise<any[]> {
  try { return await neo4j.runCypher(cypher); }
  catch { return []; }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function val(v: any): number {
  return v && typeof v === "object" && "low" in v ? v.low : (typeof v === "number" ? v : 0);
}

// ─── Types ───────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  name: string;
  properties: Record<string, any>;
}

interface GraphEdge {
  type: string;
  targetNode: GraphNode;
  score: number;       // relevance to the request
  reason: string;      // why this edge matters
}

interface HopResult {
  hop: number;
  fromNode: string;
  edges: GraphEdge[];
  bestEdge: GraphEdge | null;
  reasoning: string;
  path: string;
}

interface ThinkResult {
  request: string;
  seedNodes: GraphNode[];
  hops: HopResult[];
  discoveredKnowledge: Map<string, Set<string>>;  // category → items
  tracedPaths: string[];   // full reasoning chains
  confidence: number;
}

// ─── Seed Node Discovery ─────────────────────────────────────────────
// Find the best starting points for graph exploration

async function findSeedNodes(request: string): Promise<GraphNode[]> {
  const words = request.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);

  const seeds: GraphNode[] = [];

  // STRATEGY: Infer the domain from the request and find the richest app in that domain.
  // "barber booking" → scheduling domain → Cal.com (415 nodes) is the best teacher.
  const domainKeywords: Record<string, string[]> = {
    scheduling: ["booking", "appointment", "schedule", "calendar", "reservation", "barber", "salon", "clinic"],
    document: ["document", "signing", "pdf", "contract", "template"],
    project_management: ["project", "task", "issue", "kanban", "board", "sprint"],
    chat_platform: ["chat", "message", "api", "request", "endpoint"],
    marketplace: ["ai", "agent", "model", "chatbot", "llm", "invoice", "finance"],
  };

  // Find which domains this request touches
  const matchedClasses: string[] = [];
  for (const [cls, triggers] of Object.entries(domainKeywords)) {
    if (triggers.some(t => words.includes(t))) {
      matchedClasses.push(cls);
    }
  }

  // Seed 1: Find the RICHEST app per matched domain (sorted by total content)
  if (matchedClasses.length > 0) {
    for (const cls of matchedClasses) {
      const apps = await q(`
        MATCH (a:LearnedApp)
        WHERE toLower(a.app_class) CONTAINS '${esc(cls)}'
        OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
        WITH a, count(f) AS fCount
        RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class, fCount
        ORDER BY fCount DESC LIMIT 1
      `);
      for (const r of apps) {
        if (!seeds.find(s => s.id === r.id)) {
          seeds.push({ id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.app_class, feature_count: val(r.fCount) } });
        }
      }
    }
  }

  // Seed 2: Also find apps that directly match request words
  for (const w of words) {
    const apps = await q(`
      MATCH (a:LearnedApp)
      WHERE toLower(a.name) CONTAINS '${esc(w)}'
      RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class
      LIMIT 2
    `);
    for (const r of apps) {
      if (!seeds.find(s => s.id === r.id) && seeds.length < 6) {
        seeds.push({ id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.app_class } });
      }
    }
  }

  // Seed 3: Find features that match request words (cross-app)
  for (const w of words) {
    const features = await q(`
      MATCH (f:LearnedFeature)
      WHERE toLower(f.name) CONTAINS '${esc(w)}'
      RETURN f.feature_id AS id, 'LearnedFeature' AS label, f.name AS name,
             f.complexity AS complexity, f.description AS description
      LIMIT 2
    `);
    for (const r of features) {
      if (!seeds.find(s => s.id === r.id) && seeds.length < 8) {
        seeds.push({ id: r.id, label: r.label, name: r.name, properties: { complexity: r.complexity, description: r.description } });
      }
    }
  }

  // Seed 4: Find matching data models
  for (const w of words) {
    const models = await q(`
      MATCH (m:LearnedDataModel)
      WHERE toLower(m.name) CONTAINS '${esc(w)}'
      RETURN m.name AS id, 'LearnedDataModel' AS label, m.name AS name,
             m.category AS category
      LIMIT 2
    `);
    for (const r of models) {
      if (!seeds.find(s => s.name === r.name) && seeds.length < 10) {
        seeds.push({ id: r.id, label: r.label, name: r.name, properties: { category: r.category } });
      }
    }
  }

  return seeds;
}

// ─── Edge Discovery ──────────────────────────────────────────────────
// From a given node, find all outgoing edges and their targets

async function discoverEdges(node: GraphNode): Promise<GraphEdge[]> {
  const edges: GraphEdge[] = [];

  if (node.label === "LearnedApp") {
    // From an app, we can reach features, models, integrations, patterns, flows
    const features = await q(`
      MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_FEATURE]->(f:LearnedFeature)
      RETURN f.feature_id AS id, f.name AS name, f.complexity AS complexity,
             f.description AS desc, f.file_count AS file_count
      ORDER BY f.file_count DESC LIMIT 15
    `);
    for (const r of features) {
      edges.push({
        type: "HAS_FEATURE",
        targetNode: { id: r.id, label: "LearnedFeature", name: r.name, properties: { complexity: r.complexity, description: r.desc } },
        score: 0, reason: "",
      });
    }

    const models = await q(`
      MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
      RETURN m.name AS name, m.category AS category, m.field_count AS fc, m.fields_csv AS fields
      ORDER BY m.field_count DESC LIMIT 15
    `);
    for (const r of models) {
      edges.push({
        type: "HAS_DATA_MODEL",
        targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category, fields: r.fields } },
        score: 0, reason: "",
      });
    }

    const integrations = await q(`
      MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_INTEGRATION]->(i:LearnedIntegration)
      RETURN i.name AS name, i.type AS type, i.provider AS provider, i.auth_method AS auth
      LIMIT 15
    `);
    for (const r of integrations) {
      edges.push({
        type: "HAS_INTEGRATION",
        targetNode: { id: r.name, label: "LearnedIntegration", name: r.name, properties: { type: r.type, provider: r.provider, auth_method: r.auth } },
        score: 0, reason: "",
      });
    }

    const patterns = await q(`
      MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:USES_PATTERN]->(p:LearnedPattern)
      RETURN p.name AS name, p.type AS type, p.description AS desc
      LIMIT 15
    `);
    for (const r of patterns) {
      edges.push({
        type: "USES_PATTERN",
        targetNode: { id: r.name, label: "LearnedPattern", name: r.name, properties: { type: r.type, description: r.desc } },
        score: 0, reason: "",
      });
    }

    const flows = await q(`
      MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_USER_FLOW]->(f:LearnedUserFlow)
      RETURN f.name AS name, f.steps_description AS steps, f.step_count AS stepCount
      LIMIT 10
    `);
    for (const r of flows) {
      edges.push({
        type: "HAS_USER_FLOW",
        targetNode: { id: r.name, label: "LearnedUserFlow", name: r.name, properties: { steps: r.steps, step_count: r.stepCount } },
        score: 0, reason: "",
      });
    }
  }

  if (node.label === "LearnedFeature") {
    // From a feature, trace back to its app then to sibling features
    const app = await q(`
      MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature {feature_id: '${esc(node.id)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass
      LIMIT 1
    `);
    if (app.length > 0) {
      edges.push({
        type: "BELONGS_TO_APP",
        targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: { app_class: app[0].appClass } },
        score: 0, reason: "",
      });
    }
  }

  if (node.label === "LearnedDataModel") {
    // From a model, find its app and sibling models
    const app = await q(`
      MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass
      LIMIT 1
    `);
    if (app.length > 0) {
      edges.push({
        type: "BELONGS_TO_APP",
        targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: { app_class: app[0].appClass } },
        score: 0, reason: "",
      });
    }

    // Find related models in the same category
    const related = await q(`
      MATCH (m:LearnedDataModel {name: '${esc(node.name)}'})
      MATCH (m2:LearnedDataModel)
      WHERE m2.category = m.category AND m2.name <> m.name
      RETURN DISTINCT m2.name AS name, m2.category AS category, m2.field_count AS fc
      ORDER BY m2.field_count DESC LIMIT 5
    `);
    for (const r of related) {
      edges.push({
        type: "SAME_CATEGORY",
        targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category } },
        score: 0, reason: "",
      });
    }
  }

  if (node.label === "LearnedPattern") {
    // From a pattern, find which apps use it (reverse edge)
    const apps = await q(`
      MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass
      LIMIT 3
    `);
    for (const r of apps) {
      edges.push({
        type: "USED_BY_APP",
        targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.appClass } },
        score: 0, reason: "",
      });
    }
  }

  if (node.label === "LearnedIntegration") {
    // From an integration, find which apps use it
    const apps = await q(`
      MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass
      LIMIT 3
    `);
    for (const r of apps) {
      edges.push({
        type: "USED_BY_APP",
        targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.appClass } },
        score: 0, reason: "",
      });
    }
  }

  return edges;
}

// ─── Edge Scoring ────────────────────────────────────────────────────
// Score each edge for relevance to the request (keyword-based heuristic)

function scoreEdges(edges: GraphEdge[], requestKeywords: string[]): GraphEdge[] {
  for (const edge of edges) {
    let score = 0;
    const target = edge.targetNode;
    const targetText = `${target.name} ${target.properties.description || ""} ${target.properties.category || ""} ${target.properties.type || ""} ${target.properties.fields || ""}`.toLowerCase();

    for (const kw of requestKeywords) {
      if (targetText.includes(kw)) score += 2;
    }

    // Bonus for high-value node types
    if (target.label === "LearnedDataModel") score += 1;  // models are always valuable
    if (target.label === "LearnedPattern") score += 1;     // patterns are reusable
    if (target.label === "LearnedUserFlow") score += 1;    // flows guide UX

    // Bonus for complexity
    if (target.properties.complexity === "complex") score += 1;

    // Bonus for edge types that expand knowledge
    if (edge.type === "HAS_DATA_MODEL") score += 1;
    if (edge.type === "HAS_USER_FLOW") score += 1;
    if (edge.type === "USES_PATTERN") score += 1;

    edge.score = score;

    // Build reason
    const matchedKws = requestKeywords.filter(kw => targetText.includes(kw));
    if (matchedKws.length > 0) {
      edge.reason = `matches: ${matchedKws.join(", ")}`;
    } else if (score > 0) {
      edge.reason = `structural value (${target.label})`;
    } else {
      edge.reason = "low relevance";
    }
  }

  return edges.sort((a, b) => b.score - a.score);
}

// ─── Think-on-Graph Walker ───────────────────────────────────────────

async function thinkOnGraph(request: string, maxHops: number = 4, beamWidth: number = 3): Promise<ThinkResult> {
  const keywords = request.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !new Set(["the", "and", "for", "with", "app", "build", "create", "make", "want", "need"]).has(w));

  const result: ThinkResult = {
    request,
    seedNodes: [],
    hops: [],
    discoveredKnowledge: new Map([
      ["features", new Set<string>()],
      ["models", new Set<string>()],
      ["integrations", new Set<string>()],
      ["patterns", new Set<string>()],
      ["flows", new Set<string>()],
      ["apps", new Set<string>()],
    ]),
    tracedPaths: [],
    confidence: 0,
  };

  // Step 1: Find seed nodes
  result.seedNodes = await findSeedNodes(request);
  if (result.seedNodes.length === 0) {
    return result;
  }

  // Step 2: Beam search with HUNGER-DRIVEN exploration
  const visited = new Set<string>();   // nodes we've already explored FROM
  const seen = new Set<string>();      // nodes we've seen at all (prevents loops)
  let currentBeam: GraphNode[] = result.seedNodes.slice(0, beamWidth);

  // Mark seeds as seen
  for (const s of currentBeam) seen.add(`${s.label}:${s.name}`);

  for (let hop = 0; hop < maxHops; hop++) {
    const nextBeam: GraphNode[] = [];

    // HUNGER CHECK: what knowledge categories are we MISSING?
    const hungerBonus = new Map<string, number>();
    const cats = result.discoveredKnowledge;
    if (cats.get("features")!.size < 3) hungerBonus.set("LearnedFeature", 3);
    if (cats.get("models")!.size < 3) hungerBonus.set("LearnedDataModel", 3);
    if (cats.get("integrations")!.size < 2) hungerBonus.set("LearnedIntegration", 4);
    if (cats.get("patterns")!.size < 3) hungerBonus.set("LearnedPattern", 3);
    if (cats.get("flows")!.size < 2) hungerBonus.set("LearnedUserFlow", 4);

    for (const node of currentBeam) {
      const nodeKey = `${node.label}:${node.name}`;
      if (visited.has(nodeKey)) continue;
      visited.add(nodeKey);

      // Record what we discovered
      recordDiscovery(result.discoveredKnowledge, node);

      // Discover and score edges
      const rawEdges = await discoverEdges(node);
      const scoredEdges = scoreEdges(rawEdges, keywords);

      // Apply HUNGER bonus — edges leading to under-explored categories score higher
      for (const e of scoredEdges) {
        const bonus = hungerBonus.get(e.targetNode.label) || 0;
        if (bonus > 0) {
          e.score += bonus;
          e.reason += ` +${bonus} hunger`;
        }
      }

      // Re-sort after hunger bonus
      scoredEdges.sort((a, b) => b.score - a.score);

      // Filter out already-seen targets (LOOP PREVENTION)
      const fresh = scoredEdges.filter(e => !seen.has(`${e.targetNode.label}:${e.targetNode.name}`));

      // Take top edges with DIVERSITY — pick best from each node type
      const relevant = fresh.filter(e => e.score > 0);
      const bestEdges: GraphEdge[] = [];
      const seenTypes = new Set<string>();
      // First pass: one per node type (diversity)
      for (const e of relevant) {
        if (!seenTypes.has(e.targetNode.label) && bestEdges.length < beamWidth) {
          bestEdges.push(e);
          seenTypes.add(e.targetNode.label);
        }
      }
      // Second pass: fill remaining beam with highest scorers
      for (const e of relevant) {
        if (!bestEdges.includes(e) && bestEdges.length < beamWidth) {
          bestEdges.push(e);
        }
      }

      const hopResult: HopResult = {
        hop: hop + 1,
        fromNode: `${node.label}:${node.name}`,
        edges: scoredEdges.slice(0, 8),
        bestEdge: bestEdges[0] || null,
        reasoning: bestEdges.length > 0
          ? `Found ${scoredEdges.length} edges, ${fresh.length} fresh, ${bestEdges.length} selected. Hunger: [${Array.from(hungerBonus.entries()).map(([k,v]) => `${k.replace("Learned","")}+${v}`).join(", ")}]`
          : `Found ${scoredEdges.length} edges, ${fresh.length} fresh. Dead end.`,
        path: `${node.label}:${node.name}${bestEdges[0] ? ` -[${bestEdges[0].type}]→ ${bestEdges[0].targetNode.label}:${bestEdges[0].targetNode.name}` : ""}`,
      };

      result.hops.push(hopResult);

      // Build traced paths and mark targets as seen
      for (const edge of bestEdges) {
        result.tracedPaths.push(`${node.label}:${node.name} -[${edge.type}]→ ${edge.targetNode.label}:${edge.targetNode.name}`);
        seen.add(`${edge.targetNode.label}:${edge.targetNode.name}`);
        nextBeam.push(edge.targetNode);
      }
    }

    if (nextBeam.length === 0) break;

    // Deduplicate next beam
    const uniqueNext: GraphNode[] = [];
    const nextSeen = new Set<string>();
    for (const n of nextBeam) {
      const k = `${n.label}:${n.name}`;
      if (!nextSeen.has(k) && !visited.has(k)) {
        uniqueNext.push(n);
        nextSeen.add(k);
      }
    }
    currentBeam = uniqueNext.slice(0, beamWidth * 2); // wider beam for next hop
  }

  // Calculate confidence based on discovered breadth
  const categories = Array.from(result.discoveredKnowledge.values());
  const nonEmpty = categories.filter(s => s.size > 0).length;
  result.confidence = Math.round((nonEmpty / categories.length) * 100);

  return result;
}

function recordDiscovery(knowledge: Map<string, Set<string>>, node: GraphNode) {
  switch (node.label) {
    case "LearnedApp":
      knowledge.get("apps")!.add(node.name);
      break;
    case "LearnedFeature":
      knowledge.get("features")!.add(node.name);
      break;
    case "LearnedDataModel":
      knowledge.get("models")!.add(`${node.name} (${node.properties.category || "general"})`);
      break;
    case "LearnedIntegration":
      knowledge.get("integrations")!.add(`${node.name} [${node.properties.type || "other"}]`);
      break;
    case "LearnedPattern":
      knowledge.get("patterns")!.add(`${node.name} [${node.properties.type || "unknown"}]`);
      break;
    case "LearnedUserFlow":
      knowledge.get("flows")!.add(node.name);
      break;
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const request = process.argv[2] || "barber shop appointment booking app";

  neo4j = getNeo4jService();
  await neo4j.connect();

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  AES Think-on-Graph`);
  console.log(`  Request: "${request}"`);
  console.log(`  Method: Iterative beam search over knowledge graph`);
  console.log(`${"═".repeat(70)}\n`);

  const result = await thinkOnGraph(request, 3, 5);

  // ── Print seed nodes ──
  console.log(`  ▸ SEED NODES (starting points for exploration):`);
  for (const seed of result.seedNodes) {
    console.log(`    ${seed.label}:${seed.name} ${JSON.stringify(seed.properties)}`);
  }

  // ── Print hop-by-hop reasoning ──
  console.log(`\n  ▸ HOP-BY-HOP REASONING:`);
  for (const hop of result.hops) {
    console.log(`\n    ── Hop ${hop.hop} from ${hop.fromNode} ──`);
    console.log(`    ${hop.reasoning}`);

    // Show top scored edges
    const topEdges = hop.edges.filter(e => e.score > 0).slice(0, 5);
    if (topEdges.length > 0) {
      for (const e of topEdges) {
        const icon = e.score >= 4 ? "🟢" : e.score >= 2 ? "🟡" : "⚪";
        console.log(`      ${icon} [${e.score}] -[${e.type}]→ ${e.targetNode.label}:${e.targetNode.name} (${e.reason})`);
      }
    }

    // Show dead-end edges
    const deadEnds = hop.edges.filter(e => e.score === 0).length;
    if (deadEnds > 0) {
      console.log(`      ⚫ ${deadEnds} edge(s) scored 0 — not followed`);
    }
  }

  // ── Print traced paths ──
  console.log(`\n  ▸ TRACED REASONING PATHS (every fact has a graph path):`);
  const uniquePaths = [...new Set(result.tracedPaths)];
  for (const path of uniquePaths.slice(0, 20)) {
    console.log(`    ${path}`);
  }

  // ── Print discovered knowledge ──
  console.log(`\n  ▸ DISCOVERED KNOWLEDGE (accumulated across all hops):`);
  for (const [category, items] of result.discoveredKnowledge) {
    if (items.size > 0) {
      const arr = Array.from(items);
      console.log(`\n    ${category.toUpperCase()} (${items.size}):`);
      for (const item of arr.slice(0, 10)) {
        console.log(`      • ${item}`);
      }
      if (arr.length > 10) console.log(`      ... +${arr.length - 10} more`);
    }
  }

  // ── Confidence ──
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  RESULT: ${result.confidence}% knowledge coverage`);
  console.log(`  Explored: ${result.hops.length} hops, ${uniquePaths.length} traced paths`);
  console.log(`  Discovered: ${Array.from(result.discoveredKnowledge.values()).reduce((sum, s) => sum + s.size, 0)} unique knowledge items`);
  console.log(`${"═".repeat(70)}\n`);

  await neo4j.close();
}

main().catch(console.error);
