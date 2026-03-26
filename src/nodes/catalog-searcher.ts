import type { AESStateType } from "../state.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

const CATALOG_DIR = "/tmp/aes-catalog/packages";

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  type: string;
  repo: string;
  package_path: string;
  tags: string[];
  promotion_tier: string;
}

function loadCatalog(): CatalogEntry[] {
  if (!existsSync(CATALOG_DIR)) return [];

  const files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith(".yaml"));
  return files.map((f) => {
    const content = readFileSync(join(CATALOG_DIR, f), "utf-8");
    return parseYaml(content) as CatalogEntry;
  });
}

function matchFeatureToCatalog(
  feature: any,
  catalog: CatalogEntry[]
): { entry: CatalogEntry; score: number; reason: string }[] {
  const featureLower = feature.name.toLowerCase();
  const matches: { entry: CatalogEntry; score: number; reason: string }[] = [];

  for (const entry of catalog) {
    let score = 0;
    const reasons: string[] = [];

    // Name similarity
    const entryLower = entry.name.toLowerCase();
    if (featureLower.includes(entryLower) || entryLower.includes(featureLower)) {
      score += 0.4;
      reasons.push("Name match");
    }

    // Tag overlap with feature keywords
    const featureWords = featureLower.split(/[\s-_]+/);
    const tagOverlap = (entry.tags || []).filter((t: string) =>
      featureWords.some((w: string) => t.toLowerCase().includes(w) || w.includes(t.toLowerCase()))
    );
    if (tagOverlap.length > 0) {
      score += 0.3 * (tagOverlap.length / Math.max(featureWords.length, 1));
      reasons.push(`Tag overlap: ${tagOverlap.join(", ")}`);
    }

    // Keyword matching in description
    const descWords = featureWords.filter((w: string) => w.length > 3);
    const descMatches = descWords.filter((w: string) =>
      entry.description.toLowerCase().includes(w)
    );
    if (descMatches.length > 0) {
      score += 0.2 * (descMatches.length / Math.max(descWords.length, 1));
      reasons.push(`Description match: ${descMatches.join(", ")}`);
    }

    // Promotion tier bonus
    if (entry.promotion_tier === "CANONICAL") score += 0.1;
    else if (entry.promotion_tier === "VERIFIED") score += 0.05;

    if (score > 0.2) {
      matches.push({ entry, score, reason: reasons.join("; ") });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Catalog Searcher — for each feature in the build order,
 * searches the catalog for reusable assets.
 * Runs once before bridge compilation begins.
 */
export async function catalogSearcher(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.appSpec) {
    cb?.onFail("No AppSpec for catalog search");
    return { currentGate: "failed" as const, errorMessage: "Missing AppSpec" };
  }

  cb?.onGate("gate_2", "Searching catalog for reusable assets...");

  const catalog = loadCatalog();
  cb?.onStep(`${catalog.length} catalog entries loaded`);

  // Enrich with graph context if available
  const graphCtx = state.graphContext;
  const graphPatterns = graphCtx?.knownPatterns || [];
  const graphFeatures = graphCtx?.similarFeatures || [];
  const graphBridges = graphCtx?.reusableBridges || [];

  if (graphPatterns.length > 0 || graphFeatures.length > 0 || graphBridges.length > 0) {
    cb?.onStep(
      `Graph context: ${graphPatterns.length} patterns, ${graphFeatures.length} prior features, ${graphBridges.length} reusable bridges`
    );
  }

  const featureMatches: Record<string, any[]> = {};
  let totalMatches = 0;

  for (const feature of state.appSpec.features) {
    // 1. Search YAML catalog (existing)
    const matches = matchFeatureToCatalog(feature, catalog);
    const candidates = matches.map((m) => ({
      candidate_id: m.entry.id,
      asset_type: m.entry.type,
      source_repo: m.entry.repo,
      source_path: m.entry.package_path,
      name: m.entry.name,
      description: m.entry.description,
      fit_reason: m.reason,
      constraints: [],
      selected: m.score > 0.5,
    }));

    // 2. Search graph for matching patterns/packages
    const featureLower = feature.name.toLowerCase();
    const featureWords = featureLower.split(/[\s-_]+/).filter((w: string) => w.length > 2);

    for (const pattern of graphPatterns) {
      const nameLower = (pattern.name || "").toLowerCase();
      const wordOverlap = featureWords.filter((w: string) => nameLower.includes(w));
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `graph-${pattern.type}-${pattern.name}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: pattern.type || "Pattern",
          source_repo: "neo4j-graph",
          source_path: "",
          name: pattern.name,
          description: pattern.description || "",
          fit_reason: `Graph match: ${wordOverlap.join(", ")} (${pattern.type})`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 3. Search graph for reusable bridges from prior builds
    for (const bridge of graphBridges) {
      const featNameLower = (bridge.feature_name || "").toLowerCase();
      const wordOverlap = featureWords.filter((w: string) => featNameLower.includes(w));
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: bridge.bridge_id,
          asset_type: "PriorBridge",
          source_repo: "neo4j-graph",
          source_path: "",
          name: `Prior bridge: ${bridge.feature_name}`,
          description: bridge.bridge_description || "",
          fit_reason: `Reusable bridge from prior build: ${wordOverlap.join(", ")}`,
          constraints: [],
          selected: false,
        });
      }
    }

    featureMatches[feature.feature_id] = candidates;
    totalMatches += candidates.length;

    if (candidates.length > 0) {
      const best = matches[0];
      const graphCount = candidates.length - matches.length;
      const bestLabel = best
        ? `best: ${best.entry.name} @ ${(best.score * 100).toFixed(0)}%`
        : `${graphCount} from graph`;
      cb?.onStep(
        `${feature.name}: ${candidates.length} candidates (${bestLabel})`
      );
    }
  }

  store.addLog(state.jobId, {
    gate: "gate_2",
    message: `Catalog search complete: ${totalMatches} matches across ${state.appSpec.features.length} features`,
  });

  cb?.onSuccess(`${totalMatches} reuse candidates found`);

  // Store matches in state for bridge compiler to use
  return {
    featureBridges: featureMatches,
  };
}
