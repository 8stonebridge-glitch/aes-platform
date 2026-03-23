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

  const featureMatches: Record<string, any[]> = {};
  let totalMatches = 0;

  for (const feature of state.appSpec.features) {
    const matches = matchFeatureToCatalog(feature, catalog);
    featureMatches[feature.feature_id] = matches.map((m) => ({
      candidate_id: m.entry.id,
      asset_type: m.entry.type,
      source_repo: m.entry.repo,
      source_path: m.entry.package_path,
      name: m.entry.name,
      description: m.entry.description,
      fit_reason: m.reason,
      constraints: [],
      selected: m.score > 0.5, // Auto-select high-confidence matches
    }));
    totalMatches += matches.length;

    if (matches.length > 0) {
      cb?.onStep(
        `${feature.name}: ${matches.length} candidates (best: ${matches[0].entry.name} @ ${(matches[0].score * 100).toFixed(0)}%)`
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
