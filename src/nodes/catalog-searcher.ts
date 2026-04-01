import type { AESStateType } from "../state.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { GithubService, isGithubConfigured } from "../services/github-service.js";

// Resolve catalog path relative to the project root in both src/ and dist/ runtimes.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveCatalogRoot(): string | null {
  const candidates = [
    join(__dirname, "..", ".."),
    join(__dirname, "..", "..", ".."),
    process.cwd(),
  ];

  for (const root of candidates) {
    if (existsSync(join(root, "catalog"))) return root;
  }

  return null;
}

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

function loadCatalogFromDir(dir: string): CatalogEntry[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((f) => {
    const content = readFileSync(join(dir, f), "utf-8");
    return parseYaml(content) as CatalogEntry;
  });
}

function loadCatalog(): CatalogEntry[] {
  const catalogRoot = resolveCatalogRoot();
  if (!catalogRoot) return [];

  const packages = loadCatalogFromDir(join(catalogRoot, "catalog", "packages"));
  const patterns = loadCatalogFromDir(join(catalogRoot, "catalog", "patterns"));
  const templates = loadCatalogFromDir(join(catalogRoot, "catalog", "templates"));
  return [...packages, ...patterns, ...templates];
}

/**
 * Fetch actual source files from GitHub for selected catalog matches.
 * All catalog entries now live in the aes-platform monorepo.
 */
async function fetchSourceFiles(
  selectedMatches: { candidate_id: string; source_repo: string; source_path: string }[]
): Promise<Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>> {
  if (!isGithubConfigured()) return {};

  const github = new GithubService();
  const results: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }> = {};

  // All catalog packages are in aes-platform now
  const targetRepo = process.env.AES_MONOREPO_NAME || "aes-platform";

  for (const match of selectedMatches) {
    if (!match.source_path || match.source_repo === "neo4j-graph") continue;

    try {
      // Fetch the src/ subdirectory of the package (where actual code lives)
      const srcPath = `${match.source_path}/src`;
      const files = await github.fetchDirectoryContents(targetRepo, srcPath, "main", 2);

      // If no src/ directory, try the package root directly
      if (files.length === 0) {
        const rootFiles = await github.fetchDirectoryContents(targetRepo, match.source_path, "main", 1);
        if (rootFiles.length > 0) {
          results[match.candidate_id] = {
            repo: targetRepo,
            path: match.source_path,
            files: rootFiles,
          };
        }
      } else {
        results[match.candidate_id] = {
          repo: targetRepo,
          path: match.source_path,
          files,
        };
      }
    } catch (err: any) {
      console.warn(`[catalog-searcher] Failed to fetch files for ${match.candidate_id}: ${err.message}`);
    }
  }

  return results;
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
  const buildExtractedPatterns = graphCtx?.buildExtractedPatterns || [];
  const learnedComponentPatterns = graphCtx?.learnedComponentPatterns || [];
  const learnedFormPatterns = graphCtx?.learnedFormPatterns || [];
  const unifiedDiscoveredKnowledge: Record<string, string[]> = graphCtx?.unifiedDiscoveredKnowledge || {};
  const convexSchemas = graphCtx?.convexSchemas || [];
  const referenceSchemas = graphCtx?.referenceSchemas || [];

  const dkDomains = Object.keys(unifiedDiscoveredKnowledge);
  if (graphPatterns.length > 0 || graphFeatures.length > 0 || graphBridges.length > 0 ||
      buildExtractedPatterns.length > 0 || learnedComponentPatterns.length > 0 ||
      learnedFormPatterns.length > 0 || dkDomains.length > 0 ||
      convexSchemas.length > 0 || referenceSchemas.length > 0) {
    cb?.onStep(
      `Graph context: ${graphPatterns.length} patterns, ${graphFeatures.length} prior features, ${graphBridges.length} bridges, ` +
      `${buildExtractedPatterns.length} build-extracted, ${learnedComponentPatterns.length} components, ` +
      `${learnedFormPatterns.length} forms, ${dkDomains.length} knowledge domains, ` +
      `${convexSchemas.length} convex schemas, ${referenceSchemas.length} ref schemas`
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

    // 4. Search build-extracted patterns from prior successful builds
    for (const bxp of buildExtractedPatterns) {
      const bxpName = (bxp.name || "").toLowerCase();
      const bxpDesc = (bxp.description || "").toLowerCase();
      const bxpType = (bxp.type || "").toLowerCase();
      const wordOverlap = featureWords.filter(
        (w: string) => bxpName.includes(w) || bxpDesc.includes(w) || bxpType.includes(w)
      );
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `bx-pattern-${bxp.name}-${bxp.build_id || "unknown"}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "BuildExtractedPattern",
          source_repo: "neo4j-graph",
          source_path: "",
          name: bxp.name,
          description: `${bxp.description || ""}${bxp.code_sample ? ` | sample: ${bxp.code_sample.slice(0, 200)}` : ""}`,
          fit_reason: `Build-extracted ${bxp.type || "pattern"} from prior build: ${wordOverlap.join(", ")}`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 5. Search learned component patterns (reusable UI building blocks)
    for (const comp of learnedComponentPatterns) {
      const compName = (comp.name || "").toLowerCase();
      const compDesc = (comp.description || "").toLowerCase();
      const compCat = (comp.category || "").toLowerCase();
      const wordOverlap = featureWords.filter(
        (w: string) => compName.includes(w) || compDesc.includes(w) || compCat.includes(w)
      );
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `comp-pattern-${comp.name}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "LearnedComponentPattern",
          source_repo: "neo4j-graph",
          source_path: "",
          name: comp.name,
          description: `${comp.description || ""}${comp.usage_example ? ` | usage: ${comp.usage_example.slice(0, 200)}` : ""}`,
          fit_reason: `Learned component (${comp.category || "UI"}): ${wordOverlap.join(", ")}`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 6. Search learned form patterns (validated form structures)
    for (const form of learnedFormPatterns) {
      const formName = (form.name || "").toLowerCase();
      const formDesc = (form.description || "").toLowerCase();
      const wordOverlap = featureWords.filter(
        (w: string) => formName.includes(w) || formDesc.includes(w)
      );
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `form-pattern-${form.name}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "LearnedFormPattern",
          source_repo: "neo4j-graph",
          source_path: "",
          name: form.name,
          description: `${form.description || ""}${form.fields ? ` | fields: ${form.fields}` : ""}${form.validation_rules ? ` | validation: ${form.validation_rules}` : ""}`,
          fit_reason: `Learned form pattern: ${wordOverlap.join(", ")}`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 7. Search unified discovered knowledge (beam search results by domain)
    for (const [domain, knowledgeItems] of Object.entries(unifiedDiscoveredKnowledge)) {
      const domainLower = domain.toLowerCase();
      const domainMatch = featureWords.some((w: string) => domainLower.includes(w));
      // Also check if any knowledge item text matches the feature
      const itemMatches = knowledgeItems.filter((item: string) =>
        featureWords.some((w: string) => item.toLowerCase().includes(w))
      );
      if (domainMatch || itemMatches.length > 0) {
        const matchReason = domainMatch
          ? `Domain "${domain}" matches feature`
          : `${itemMatches.length} knowledge items match`;
        const preview = (itemMatches.length > 0 ? itemMatches : knowledgeItems).slice(0, 3).join("; ");
        candidates.push({
          candidate_id: `unified-knowledge-${domain}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "UnifiedKnowledge",
          source_repo: "neo4j-graph",
          source_path: "",
          name: `Discovered knowledge: ${domain}`,
          description: preview.slice(0, 300),
          fit_reason: `Unified beam search: ${matchReason}`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 8. Search Convex schemas from prior successful builds
    for (const schema of convexSchemas) {
      const schemaName = (schema.name || "").toLowerCase();
      const schemaTables = (schema.tables || "").toLowerCase();
      const wordOverlap = featureWords.filter(
        (w: string) => schemaName.includes(w) || schemaTables.includes(w)
      );
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `convex-schema-${schema.name}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "ConvexSchema",
          source_repo: "neo4j-graph",
          source_path: "",
          name: `Convex schema: ${schema.name}`,
          description: `Tables: ${schema.tables || "unknown"}${schema.schema_text ? ` | ${schema.schema_text.slice(0, 200)}` : ""}`,
          fit_reason: `Working Convex schema (${schema.app_class || "general"}): ${wordOverlap.join(", ")}`,
          constraints: [],
          selected: false,
        });
      }
    }

    // 9. Search reference schemas (canonical data model templates)
    for (const ref of referenceSchemas) {
      const refName = (ref.name || "").toLowerCase();
      const refDomain = (ref.domain || "").toLowerCase();
      const refDesc = (ref.description || "").toLowerCase();
      const refTables = (ref.tables || "").toLowerCase();
      const wordOverlap = featureWords.filter(
        (w: string) => refName.includes(w) || refDomain.includes(w) || refDesc.includes(w) || refTables.includes(w)
      );
      if (wordOverlap.length > 0) {
        candidates.push({
          candidate_id: `ref-schema-${ref.name}`.replace(/\s+/g, "-").toLowerCase(),
          asset_type: "ReferenceSchema",
          source_repo: "neo4j-graph",
          source_path: "",
          name: `Reference schema: ${ref.name}`,
          description: `${ref.description || ""} | domain: ${ref.domain || "general"} | tables: ${ref.tables || "unknown"}`,
          fit_reason: `Reference data model (${ref.domain || "general"}): ${wordOverlap.join(", ")}`,
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

  // Step 2 of 4-step reuse: Fetch real files from GitHub for selected candidates
  const allSelectedCandidates: { candidate_id: string; source_repo: string; source_path: string }[] = [];
  for (const candidates of Object.values(featureMatches)) {
    for (const c of candidates) {
      if (c.selected && c.source_repo !== "neo4j-graph" && c.source_path) {
        allSelectedCandidates.push(c);
      }
    }
  }

  // Deduplicate by candidate_id
  const uniqueCandidates = Array.from(
    new Map(allSelectedCandidates.map((c) => [c.candidate_id, c])).values()
  );

  let reusableSourceFiles: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }> = {};

  if (uniqueCandidates.length > 0) {
    cb?.onStep(`Fetching source files for ${uniqueCandidates.length} selected reuse candidates from GitHub...`);
    reusableSourceFiles = await fetchSourceFiles(uniqueCandidates);

    const fetchedCount = Object.keys(reusableSourceFiles).length;
    const totalFiles = Object.values(reusableSourceFiles).reduce((sum, r) => sum + r.files.length, 0);

    if (fetchedCount > 0) {
      cb?.onStep(`Fetched ${totalFiles} source files from ${fetchedCount} packages`);
      store.addLog(state.jobId, {
        gate: "gate_2",
        message: `GitHub fetch: ${totalFiles} files from ${fetchedCount} packages for builder context`,
      });
    } else {
      cb?.onWarn("No source files fetched from GitHub — builder will generate from scratch");
    }
  }

  cb?.onSuccess(`${totalMatches} reuse candidates found`);

  // Store matches and fetched source files in state for bridge compiler and builder
  return {
    featureBridges: featureMatches,
    reusableSourceFiles,
  };
}
