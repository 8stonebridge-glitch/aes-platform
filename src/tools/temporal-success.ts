/**
 * temporal-success.ts — Track which graph paths lead to successful builds.
 *
 * Records build outcomes against the reasoning paths that were used,
 * creating a temporal feedback signal. Over time, the graph learns
 * which apps, features, models, integrations, and patterns reliably
 * produce good builds — and which ones correlate with failures.
 *
 * This enables:
 *   - Path success scoring: "this reasoning path succeeded 8/10 times"
 *   - Source reliability: "Cal.com features have 90% build success"
 *   - Pattern effectiveness: "RBAC pattern succeeds more than basic auth"
 *   - Temporal decay: recent outcomes weighted more than old ones
 *
 * Usage:
 *   import { recordBuildOutcome, getPathSuccessScores } from "./temporal-success.js";
 *
 *   // After a build completes:
 *   await recordBuildOutcome(neo4j, {
 *     runId: "run-001",
 *     featureName: "Booking",
 *     succeeded: true,
 *     reasoningPaths: [...paths from unified reasoner],
 *     usedApps: ["Cal.com"],
 *     usedFeatures: ["Bookings", "Slots"],
 *     usedModels: ["Booking", "EventType"],
 *     usedPatterns: ["RBAC"],
 *     usedIntegrations: ["stripe"],
 *   });
 *
 *   // During reasoning — boost paths with good track records:
 *   const scores = await getPathSuccessScores(neo4j, ["Cal.com", "Documenso"]);
 *
 * CLI:
 *   npx tsx src/tools/temporal-success.ts --stats           # show success stats
 *   npx tsx src/tools/temporal-success.ts --leaderboard     # best/worst sources
 */

import { getNeo4jService } from "../services/neo4j-service.js";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface BuildOutcomeRecord {
  runId: string;
  featureName: string;
  succeeded: boolean;
  /** From unified-graph-reasoner tracedPaths */
  reasoningPaths: string[];
  /** Apps that contributed to the build plan */
  usedApps: string[];
  /** Features referenced in the blueprint */
  usedFeatures: string[];
  /** Models referenced in the blueprint */
  usedModels: string[];
  /** Patterns used */
  usedPatterns: string[];
  /** Integrations used */
  usedIntegrations: string[];
  /** Optional: verification score (0-1) */
  verificationScore?: number;
  /** Optional: fact validation score (0-1) */
  factValidationScore?: number;
}

export interface SuccessScore {
  name: string;
  label: string;
  totalBuilds: number;
  successCount: number;
  failCount: number;
  successRate: number;
  /** Weighted success rate with temporal decay */
  weightedSuccessRate: number;
  /** Average verification score across builds */
  avgVerificationScore: number;
  /** Trend: improving, stable, declining */
  trend: "improving" | "stable" | "declining";
}

export interface SuccessLeaderboard {
  topSources: SuccessScore[];
  bottomSources: SuccessScore[];
  topPatterns: SuccessScore[];
  overallSuccessRate: number;
  totalBuildsTracked: number;
}

// ═══════════════════════════════════════════════════════════════════════
// RECORD BUILD OUTCOMES
// ═══════════════════════════════════════════════════════════════════════

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Record a build outcome in the graph.
 * Creates a BuildOutcome node linked to all graph entities that contributed.
 */
export async function recordBuildOutcome(
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
  record: BuildOutcomeRecord,
): Promise<void> {
  const now = new Date().toISOString();

  // Create the outcome node
  await neo4jRun(`
    MERGE (o:BuildOutcome {run_id: '${esc(record.runId)}'})
    SET o.feature_name = '${esc(record.featureName)}',
        o.succeeded = ${record.succeeded},
        o.verification_score = ${record.verificationScore ?? -1},
        o.fact_validation_score = ${record.factValidationScore ?? -1},
        o.path_count = ${record.reasoningPaths.length},
        o.recorded_at = '${now}'
  `);

  // Link to apps
  for (const app of record.usedApps) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MATCH (a:LearnedApp {name: '${esc(app)}'})
      MERGE (o)-[:USED_SOURCE]->(a)
    `);
  }

  // Link to features
  for (const feat of record.usedFeatures) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MATCH (f:LearnedFeature)
      WHERE f.name = '${esc(feat)}'
      MERGE (o)-[:USED_FEATURE]->(f)
    `);
  }

  // Link to models
  for (const model of record.usedModels) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MATCH (m:LearnedDataModel {name: '${esc(model)}'})
      MERGE (o)-[:USED_MODEL]->(m)
    `);
  }

  // Link to patterns
  for (const pat of record.usedPatterns) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MATCH (p:LearnedPattern {name: '${esc(pat)}'})
      MERGE (o)-[:USED_PATTERN]->(p)
    `);
  }

  // Link to integrations
  for (const integ of record.usedIntegrations) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MATCH (i:LearnedIntegration {name: '${esc(integ)}'})
      MERGE (o)-[:USED_INTEGRATION]->(i)
    `);
  }

  // Store reasoning paths as a linked list
  for (let i = 0; i < Math.min(record.reasoningPaths.length, 50); i++) {
    await neo4jRun(`
      MATCH (o:BuildOutcome {run_id: '${esc(record.runId)}'})
      MERGE (rp:ReasoningPath {outcome_run_id: '${esc(record.runId)}', step: ${i}})
      SET rp.path = '${esc(record.reasoningPaths[i])}'
      MERGE (o)-[:HAD_REASONING_PATH]->(rp)
    `);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// QUERY SUCCESS SCORES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get success scores for specific apps.
 * Used during reasoning to boost paths through reliable sources.
 */
export async function getPathSuccessScores(
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
  appNames: string[],
): Promise<Map<string, SuccessScore>> {
  const scores = new Map<string, SuccessScore>();

  for (const app of appNames) {
    const rows = await neo4jRun(`
      MATCH (o:BuildOutcome)-[:USED_SOURCE]->(a:LearnedApp {name: '${esc(app)}'})
      RETURN o.succeeded AS succeeded,
             o.verification_score AS vs,
             o.recorded_at AS recorded_at
      ORDER BY o.recorded_at DESC
    `);

    if (rows.length === 0) continue;

    const total = rows.length;
    const successes = rows.filter((r: any) => r.succeeded).length;
    const failures = total - successes;

    // Temporal decay: more recent builds weighted higher
    // Weight = 1 / (1 + daysSinceOutcome * 0.05)
    const now = Date.now();
    let weightedSuccess = 0;
    let totalWeight = 0;
    for (const row of rows) {
      const recordedAt = new Date(row.recorded_at).getTime();
      const daysSince = (now - recordedAt) / (1000 * 60 * 60 * 24);
      const weight = 1 / (1 + daysSince * 0.05);
      weightedSuccess += (row.succeeded ? 1 : 0) * weight;
      totalWeight += weight;
    }

    // Trend detection: compare first half vs second half
    const mid = Math.floor(rows.length / 2);
    const recentSuccess = rows.slice(0, mid).filter((r: any) => r.succeeded).length / Math.max(1, mid);
    const olderSuccess = rows.slice(mid).filter((r: any) => r.succeeded).length / Math.max(1, rows.length - mid);
    let trend: "improving" | "stable" | "declining" = "stable";
    if (recentSuccess - olderSuccess > 0.15) trend = "improving";
    else if (olderSuccess - recentSuccess > 0.15) trend = "declining";

    // Average verification score (excluding -1 sentinel)
    const vsRows = rows.filter((r: any) => r.vs !== null && r.vs >= 0);
    const avgVs = vsRows.length > 0
      ? vsRows.reduce((sum: number, r: any) => sum + r.vs, 0) / vsRows.length
      : 0;

    scores.set(app, {
      name: app,
      label: "LearnedApp",
      totalBuilds: total,
      successCount: successes,
      failCount: failures,
      successRate: successes / total,
      weightedSuccessRate: totalWeight > 0 ? weightedSuccess / totalWeight : 0,
      avgVerificationScore: avgVs,
      trend,
    });
  }

  return scores;
}

/**
 * Get success scores for any node type (features, patterns, integrations).
 */
export async function getNodeSuccessScores(
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
  nodeLabel: string,
  relType: string,
): Promise<SuccessScore[]> {
  const rows = await neo4jRun(`
    MATCH (o:BuildOutcome)-[:${relType}]->(n:${nodeLabel})
    WITH n.name AS name,
         count(o) AS total,
         count(CASE WHEN o.succeeded = true THEN 1 END) AS successes,
         avg(CASE WHEN o.verification_score >= 0 THEN o.verification_score END) AS avgVs,
         collect(o.recorded_at) AS dates,
         collect(o.succeeded) AS outcomes
    WHERE total >= 1
    RETURN name, total, successes, avgVs, dates, outcomes
    ORDER BY total DESC
  `);

  return rows.map((r: any) => {
    const total = typeof r.total === "object" ? r.total.low : r.total;
    const successes = typeof r.successes === "object" ? r.successes.low : r.successes;

    return {
      name: r.name,
      label: nodeLabel,
      totalBuilds: total,
      successCount: successes,
      failCount: total - successes,
      successRate: total > 0 ? successes / total : 0,
      weightedSuccessRate: total > 0 ? successes / total : 0, // simplified for batch
      avgVerificationScore: r.avgVs || 0,
      trend: "stable" as const,
    };
  });
}

/**
 * Get the full leaderboard — best and worst sources, patterns, etc.
 */
export async function getLeaderboard(
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
): Promise<SuccessLeaderboard> {
  // Overall stats
  const overall = await neo4jRun(`
    MATCH (o:BuildOutcome)
    RETURN count(o) AS total,
           count(CASE WHEN o.succeeded = true THEN 1 END) AS successes
  `);

  const totalBuilds = overall.length > 0 ? (typeof overall[0].total === "object" ? overall[0].total.low : overall[0].total) : 0;
  const totalSuccesses = overall.length > 0 ? (typeof overall[0].successes === "object" ? overall[0].successes.low : overall[0].successes) : 0;

  // App scores
  const appScores = await getNodeSuccessScores(neo4jRun, "LearnedApp", "USED_SOURCE");
  const patternScores = await getNodeSuccessScores(neo4jRun, "LearnedPattern", "USED_PATTERN");

  // Sort for leaderboard
  const sortedApps = [...appScores].sort((a, b) => b.successRate - a.successRate);
  const topSources = sortedApps.slice(0, 5);
  const bottomSources = sortedApps.filter(s => s.totalBuilds >= 2).sort((a, b) => a.successRate - b.successRate).slice(0, 5);
  const topPatterns = [...patternScores].sort((a, b) => b.successRate - a.successRate).slice(0, 5);

  return {
    topSources,
    bottomSources,
    topPatterns,
    overallSuccessRate: totalBuilds > 0 ? totalSuccesses / totalBuilds : 0,
    totalBuildsTracked: totalBuilds,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION HOOK — boost beam search scores with temporal success data
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a success bonus map for use in the beam search edge scorer.
 * Returns a Map<appName, bonus> where bonus is 0-3 based on success rate.
 *
 * Wire into unified-graph-reasoner.ts scoreEdges():
 *   const successBonus = await getSuccessBonus(neo4jRun);
 *   // In scoreEdges: if target is an app, add successBonus.get(app.name)
 */
export async function getSuccessBonus(
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
): Promise<Map<string, number>> {
  const bonus = new Map<string, number>();

  const rows = await neo4jRun(`
    MATCH (o:BuildOutcome)-[:USED_SOURCE]->(a:LearnedApp)
    WITH a.name AS app,
         count(o) AS total,
         count(CASE WHEN o.succeeded = true THEN 1 END) AS successes
    WHERE total >= 2
    RETURN app, total, successes
  `);

  for (const r of rows) {
    const total = typeof r.total === "object" ? r.total.low : r.total;
    const successes = typeof r.successes === "object" ? r.successes.low : r.successes;
    const rate = successes / total;

    // High success = bonus, low success = penalty
    if (rate >= 0.8) bonus.set(r.app, 3);
    else if (rate >= 0.6) bonus.set(r.app, 2);
    else if (rate >= 0.4) bonus.set(r.app, 1);
    else if (rate < 0.3 && total >= 3) bonus.set(r.app, -2); // Penalty for unreliable sources
  }

  return bonus;
}

// ═══════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const showStats = process.argv.includes("--stats");
  const showLeaderboard = process.argv.includes("--leaderboard");
  const demoMode = !showStats && !showLeaderboard;

  const neo4j = getNeo4jService();
  await neo4j.connect();
  const run = (cypher: string, params?: Record<string, any>) => neo4j.runCypher(cypher, params);

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  AES TEMPORAL SUCCESS TRACKER`);
  console.log(`${"═".repeat(65)}\n`);

  if (demoMode) {
    // Record a demo outcome
    console.log("  ▸ Recording demo build outcome...\n");

    await recordBuildOutcome(run, {
      runId: `demo-${Date.now()}`,
      featureName: "Appointment Booking",
      succeeded: true,
      reasoningPaths: [
        "LearnedApp:Cal.com →[HAS_FEATURE]→ LearnedFeature:Bookings",
        "LearnedApp:Cal.com →[HAS_DATA_MODEL]→ LearnedDataModel:Booking",
        "LearnedApp:Cal.com →[HAS_INTEGRATION]→ LearnedIntegration:stripe",
      ],
      usedApps: ["Cal.com"],
      usedFeatures: ["Bookings"],
      usedModels: ["Booking"],
      usedPatterns: [],
      usedIntegrations: ["stripe"],
      verificationScore: 0.85,
      factValidationScore: 0.47,
    });

    console.log("    ✅ Demo outcome recorded\n");
  }

  if (showStats || demoMode) {
    console.log("  ▸ BUILD OUTCOME STATS\n");

    const outcomes = await run(`
      MATCH (o:BuildOutcome)
      RETURN o.feature_name AS feature, o.succeeded AS succeeded,
             o.verification_score AS vs, o.recorded_at AS recorded_at
      ORDER BY o.recorded_at DESC
      LIMIT 20
    `);

    if (outcomes.length === 0) {
      console.log("    No build outcomes recorded yet.");
    } else {
      for (const o of outcomes) {
        const icon = o.succeeded ? "✅" : "❌";
        const vs = o.vs >= 0 ? ` (vs: ${(o.vs * 100).toFixed(0)}%)` : "";
        console.log(`    ${icon} ${o.feature}${vs} — ${o.recorded_at}`);
      }
    }
  }

  if (showLeaderboard || demoMode) {
    console.log("\n  ▸ SUCCESS LEADERBOARD\n");

    const lb = await getLeaderboard(run);

    console.log(`    Overall: ${(lb.overallSuccessRate * 100).toFixed(0)}% success rate (${lb.totalBuildsTracked} builds)\n`);

    if (lb.topSources.length > 0) {
      console.log("    TOP SOURCES:");
      for (const s of lb.topSources) {
        const icon = s.successRate >= 0.8 ? "🟢" : s.successRate >= 0.5 ? "🟡" : "🔴";
        console.log(`      ${icon} ${s.name}: ${(s.successRate * 100).toFixed(0)}% (${s.successCount}/${s.totalBuilds})`);
      }
    }

    if (lb.topPatterns.length > 0) {
      console.log("\n    TOP PATTERNS:");
      for (const p of lb.topPatterns) {
        console.log(`      ${p.name}: ${(p.successRate * 100).toFixed(0)}% (${p.successCount}/${p.totalBuilds})`);
      }
    }

    // Show success bonus map
    const bonus = await getSuccessBonus(run);
    if (bonus.size > 0) {
      console.log("\n    SUCCESS BONUS (for beam search):");
      for (const [app, b] of Array.from(bonus.entries())) {
        const sign = b >= 0 ? "+" : "";
        console.log(`      ${app}: ${sign}${b}`);
      }
    }
  }

  console.log(`\n${"═".repeat(65)}\n`);
  await neo4j.close();
}

main().catch(console.error);
