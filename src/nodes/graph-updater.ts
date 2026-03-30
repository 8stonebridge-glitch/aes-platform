/**
 * Graph Updater Node — writes pipeline results to Neo4j after each major gate.
 *
 * Graceful: if Neo4j is unavailable, logs a warning and passes through.
 * Uses the versioned-truth Cypher generators from src/graph/versioned-truth.ts.
 */

import type { AESStateType } from "../state.js";
import { getNeo4jService } from "../services/neo4j-service.js";
import {
  cypherCreateEntity,
  type EntityNode,
  type VersionNode,
} from "../graph/versioned-truth.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().split("T")[0];
}

function entityId(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

/**
 * Safely write a Cypher statement. Returns true on success, false on failure.
 */
async function safeWrite(cypher: string, label: string): Promise<boolean> {
  const neo4j = getNeo4jService();
  try {
    const rows = await neo4j.runCypher(cypher);
    if (rows.length > 0) {
      console.log(`[graph-updater] ${label}: OK`);
    }
    return true;
  } catch (err: any) {
    console.warn(`[graph-updater] ${label} failed: ${err.message}`);
    return false;
  }
}

// ─── Per-Gate Writers ────────────────────────────────────────────────

/**
 * Gate 0 — Intent confirmed: write an Entity for the intent brief.
 */
async function writeGate0(state: AESStateType): Promise<void> {
  if (!state.intentBrief || !state.intentConfirmed) return;

  const brief = state.intentBrief;
  const eid = entityId("intent", state.jobId);
  const now = ts();

  const entity: EntityNode = {
    entity_id: eid,
    name: brief.product_name || brief.title || `Intent ${state.jobId}`,
    system: "aes-pipeline",
    entity_type: "feature_spec",
    created_at: now,
  };

  const version: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
    version_id: `${eid}-v1`,
    created_at: now,
    promoted_actor: "aes-pipeline",
    snapshot_name: entity.name,
    snapshot_description: brief.description || brief.summary || "Intent brief captured at Gate 0",
  };

  // The cypherCreateEntity expects a Decision node to link to — use a
  // well-known sentinel that may or may not exist yet. The OPTIONAL MATCH
  // inside will gracefully skip if it doesn't exist (we patched the Cypher
  // to use OPTIONAL MATCH below).
  const cypher = cypherCreateEntity(entity, version, entity.name)
    // Make the Decision link optional so it doesn't fail if the node is missing
    .replace(
      "MATCH (d:Decision",
      "OPTIONAL MATCH (d:Decision"
    )
    .replace(
      "MERGE (v)-[:SNAPSHOT_OF]->(d)",
      "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
    );

  await safeWrite(cypher, `Gate 0 intent entity [${eid}]`);
}

/**
 * Gate 1 — AppSpec approved: write Entity for AppSpec + each FeatureSpec.
 */
async function writeGate1(state: AESStateType): Promise<void> {
  if (!state.appSpec || !state.userApproved) return;

  const spec = state.appSpec;
  const now = ts();

  // AppSpec entity
  const appEid = entityId("app", spec.app_id || state.jobId);
  const appEntity: EntityNode = {
    entity_id: appEid,
    name: spec.name || spec.app_name || `App ${state.jobId}`,
    system: "aes-pipeline",
    entity_type: "contract",
    created_at: now,
  };

  const appVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
    version_id: `${appEid}-v1`,
    created_at: now,
    promoted_actor: "aes-pipeline",
    snapshot_name: appEntity.name,
    snapshot_description: spec.description || "AppSpec approved at Gate 1",
  };

  const appCypher = cypherCreateEntity(appEntity, appVersion, appEntity.name)
    .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
    .replace(
      "MERGE (v)-[:SNAPSHOT_OF]->(d)",
      "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
    );

  await safeWrite(appCypher, `Gate 1 AppSpec entity [${appEid}]`);

  // Feature entities
  const features: any[] = spec.features || spec.feature_specs || [];
  for (const feat of features) {
    const fid = feat.feature_id || feat.id || feat.name;
    const featEid = entityId("feature", fid);

    const featEntity: EntityNode = {
      entity_id: featEid,
      name: feat.name || feat.title || fid,
      system: "aes-pipeline",
      entity_type: "feature_spec",
      created_at: now,
    };

    const featVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
      version_id: `${featEid}-v1`,
      created_at: now,
      promoted_actor: "aes-pipeline",
      snapshot_name: featEntity.name,
      snapshot_description: feat.description || `Feature spec for ${featEntity.name}`,
    };

    const featCypher = cypherCreateEntity(featEntity, featVersion, featEntity.name)
      .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
      .replace(
        "MERGE (v)-[:SNAPSHOT_OF]->(d)",
        "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
      );

    await safeWrite(featCypher, `Gate 1 FeatureSpec entity [${featEid}]`);
  }
}

/**
 * Gate 2 — Bridges compiled: write bridge relationships between features.
 */
async function writeGate2(state: AESStateType): Promise<void> {
  const bridges = state.featureBridges;
  if (!bridges || Object.keys(bridges).length === 0) return;

  const now = ts();
  const neo4j = getNeo4jService();

  for (const [featureId, bridge] of Object.entries(bridges)) {
    const bridgeEid = entityId("bridge", bridge.bridge_id || featureId);

    // Serialize the full bridge packet for future reuse
    const bridgePacket = {
      status: bridge.status,
      build_scope: bridge.build_scope,
      write_scope: bridge.write_scope,
      read_scope: bridge.read_scope,
      reuse_requirements: bridge.reuse_requirements,
      pattern_requirements: bridge.pattern_requirements,
      applied_rules: bridge.applied_rules,
      required_tests: bridge.required_tests,
      dependencies: bridge.dependencies,
      success_definition: bridge.success_definition,
      confidence: bridge.confidence,
      math: bridge.math,
    };

    const packetJson = JSON.stringify(bridgePacket);

    const bridgeEntity: EntityNode = {
      entity_id: bridgeEid,
      name: bridge.feature_name || `Bridge: ${featureId}`,
      system: "aes-pipeline",
      entity_type: "contract",
      created_at: now,
    };

    const bridgeVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
      version_id: `${bridgeEid}-v1`,
      created_at: now,
      promoted_actor: "aes-pipeline",
      snapshot_name: bridgeEntity.name,
      snapshot_description: bridge.build_scope?.objective || `Bridge compiled for ${bridge.feature_name || featureId}`,
      snapshot_text: packetJson,
    };

    const cypher = cypherCreateEntity(bridgeEntity, bridgeVersion, bridgeEntity.name)
      .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
      .replace(
        "MERGE (v)-[:SNAPSHOT_OF]->(d)",
        "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
      );

    await safeWrite(cypher, `Gate 2 bridge entity [${bridgeEid}]`);

    // Store bridge packet properties directly on the Entity node for fast queries
    const propsCypher = `
MATCH (e:Entity {entity_id: '${bridgeEid}'})
SET e.feature_id = '${esc(featureId)}',
    e.feature_name = '${esc(bridge.feature_name || featureId)}',
    e.bridge_status = '${esc(bridge.status || "draft")}',
    e.confidence_overall = ${bridge.confidence?.overall ?? 0},
    e.confidence_scope = ${bridge.confidence?.scope_clarity ?? 0},
    e.confidence_reuse = ${bridge.confidence?.reuse_fit ?? 0},
    e.confidence_deps = ${bridge.confidence?.dependency_clarity ?? 0},
    e.risk_score = ${bridge.math?.risk_score ?? 0},
    e.priority_rank = ${bridge.math?.priority_rank ?? 0},
    e.write_paths = ${JSON.stringify(bridge.write_scope?.allowed_repo_paths || [])},
    e.reuse_count = ${(bridge.selected_reuse_assets || []).length},
    e.test_count = ${(bridge.required_tests || []).length},
    e.rule_count = ${(bridge.applied_rules || []).length},
    e.dep_count = ${(bridge.dependencies || []).length},
    e.blocked_reason = ${bridge.blocked_reason ? `'${esc(bridge.blocked_reason)}'` : 'null'},
    e.app_class = '${esc(state.appSpec?.app_class || "unknown")}',
    e.job_id = '${esc(state.jobId)}'
RETURN e.entity_id
    `.trim();

    await safeWrite(propsCypher, `Gate 2 bridge properties [${bridgeEid}]`);

    // Link bridge to its feature entity
    const featEid = entityId("feature", featureId);
    const linkCypher = `
MATCH (b:Entity {entity_id: '${bridgeEid}'})
MATCH (f:Entity {entity_id: '${featEid}'})
MERGE (b)-[:BRIDGES]->(f)
RETURN b.entity_id, f.entity_id
    `.trim();

    await safeWrite(linkCypher, `Gate 2 bridge->feature link [${bridgeEid}->${featEid}]`);
  }
}

function esc(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

/**
 * Gate 3 — Vetoes checked: write veto results.
 */
async function writeGate3(state: AESStateType): Promise<void> {
  const vetoes = state.vetoResults;
  if (!vetoes || vetoes.length === 0) return;

  const now = ts();

  for (let i = 0; i < vetoes.length; i++) {
    const veto = vetoes[i];
    const vetoEid = entityId("veto", `${state.jobId}-${i}`);

    const vetoEntity: EntityNode = {
      entity_id: vetoEid,
      name: `Veto check: ${veto.rule_name || veto.check_name || `check-${i}`}`,
      system: "aes-pipeline",
      entity_type: "policy",
      created_at: now,
    };

    const vetoVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
      version_id: `${vetoEid}-v1`,
      created_at: now,
      promoted_actor: "aes-pipeline",
      snapshot_name: vetoEntity.name,
      snapshot_description: veto.triggered
        ? `VETO TRIGGERED: ${veto.reason || "No reason given"}`
        : `Passed: ${veto.rule_name || veto.check_name || `check-${i}`}`,
    };

    const cypher = cypherCreateEntity(vetoEntity, vetoVersion, vetoEntity.name)
      .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
      .replace(
        "MERGE (v)-[:SNAPSHOT_OF]->(d)",
        "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
      );

    await safeWrite(cypher, `Gate 3 veto entity [${vetoEid}]`);
  }
}

/**
 * Build complete — write a BuildRecord entity.
 */
async function writeBuildRecord(state: AESStateType): Promise<void> {
  if (!state.buildResults || Object.keys(state.buildResults).length === 0) return;

  const now = ts();
  const buildEid = entityId("build", state.jobId);

  const buildEntity: EntityNode = {
    entity_id: buildEid,
    name: `Build: ${state.jobId}`,
    system: "aes-pipeline",
    entity_type: "contract",
    created_at: now,
  };

  const hasError = !!state.errorMessage;
  const deployUrl = state.deploymentUrl || "none";

  const buildVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
    version_id: `${buildEid}-v1`,
    created_at: now,
    promoted_actor: "aes-pipeline",
    snapshot_name: buildEntity.name,
    snapshot_description: hasError
      ? `Build failed: ${state.errorMessage}`
      : `Build complete. Deployment: ${deployUrl}`,
  };

  const cypher = cypherCreateEntity(buildEntity, buildVersion, buildEntity.name)
    .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
    .replace(
      "MERGE (v)-[:SNAPSHOT_OF]->(d)",
      "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)"
    );

  await safeWrite(cypher, `BuildRecord entity [${buildEid}]`);

  // Link build to app entity
  const appEid = entityId("app", state.appSpec?.app_id || state.jobId);
  const linkCypher = `
MATCH (b:Entity {entity_id: '${buildEid}'})
OPTIONAL MATCH (a:Entity {entity_id: '${appEid}'})
FOREACH (_ IN CASE WHEN a IS NOT NULL THEN [1] ELSE [] END |
  MERGE (b)-[:BUILD_OF]->(a)
)
RETURN b.entity_id
  `.trim();

  await safeWrite(linkCypher, `BuildRecord->App link [${buildEid}]`);
}

/**
 * Pipeline Outcome — write a queryable record of every pipeline run.
 * Enables failure distribution analysis and self-audit.
 */
export async function writePipelineOutcome(state: AESStateType): Promise<void> {
  const now = ts();
  const success = !state.errorMessage && state.currentGate !== "failed";
  const gateReached = state.currentGate || "gate_0";

  // Determine failure reason category
  let failureCategory = "none";
  if (!success) {
    if (state.errorMessage?.includes("timed out")) failureCategory = "confirmation_timeout";
    else if (state.errorMessage?.includes("rejected")) failureCategory = "user_rejected";
    else if (state.errorMessage?.includes("ambiguity") || state.errorMessage?.includes("ambiguous")) failureCategory = "ambiguity";
    else if (state.errorMessage?.includes("validation")) failureCategory = "spec_validation";
    else if (state.errorMessage?.includes("veto") || state.errorMessage?.includes("VETO")) failureCategory = "veto_triggered";
    else if (state.errorMessage?.includes("build") || state.errorMessage?.includes("Build")) failureCategory = "build_failure";
    else if (state.errorMessage?.includes("deploy")) failureCategory = "deploy_failure";
    else failureCategory = "other";
  }

  const ambiguityFlags = state.intentBrief?.ambiguity_flags || [];
  const appClass = state.intentBrief?.inferred_app_class || state.appSpec?.app_class || "unknown";
  const riskClass = state.intentBrief?.inferred_risk_class || "unknown";
  const hadClarification = state.intentBrief?.confirmation_status === "confirmed_with_clarification";

  const cypher = `
MERGE (o:PipelineOutcome {job_id: '${esc(state.jobId)}'})
SET o.success = ${success},
    o.gate_reached = '${esc(gateReached)}',
    o.failure_category = '${esc(failureCategory)}',
    o.failure_reason = ${state.errorMessage ? `'${esc(state.errorMessage.slice(0, 200))}'` : 'null'},
    o.app_class = '${esc(appClass)}',
    o.risk_class = '${esc(riskClass)}',
    o.ambiguity_flags = ${JSON.stringify(ambiguityFlags)},
    o.had_clarification = ${hadClarification},
    o.intent_confirmed = ${!!state.intentConfirmed},
    o.user_approved = ${!!state.userApproved},
    o.feature_count = ${Object.keys(state.featureBridges || {}).length},
    o.veto_count = ${(state.vetoResults || []).filter((v: any) => v.triggered).length},
    o.created_at = '${now}'
RETURN o.job_id
  `.trim();

  await safeWrite(cypher, `PipelineOutcome [${state.jobId}]`);
}

// ─── Main Node ───────────────────────────────────────────────────────

/**
 * LangGraph node: writes accumulated pipeline state to Neo4j.
 *
 * Called after veto_checker (gates 0-3) and after deployment_handler (build record).
 * If Neo4j is unavailable, passes through without blocking.
 */
export async function graphUpdater(state: AESStateType): Promise<Partial<AESStateType>> {
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();

  if (!ok) {
    console.warn("[graph-updater] Neo4j unavailable — skipping graph writes");
    return {};
  }

  try {
    const gate = state.currentGate;

    // Write all gates up to current state
    // Gate 0: intent confirmed
    if (state.intentConfirmed) {
      await writeGate0(state);
    }

    // Gate 1: app spec approved
    if (state.userApproved && state.appSpec) {
      await writeGate1(state);
    }

    // Gate 2: bridges compiled
    if (state.featureBridges && Object.keys(state.featureBridges).length > 0) {
      await writeGate2(state);
    }

    // Gate 3: vetoes checked
    if (state.vetoResults && state.vetoResults.length > 0) {
      await writeGate3(state);
    }

    // Build complete or deploying
    if (
      gate === "complete" ||
      gate === "deploying" ||
      gate === "failed" ||
      (state.buildResults && Object.keys(state.buildResults).length > 0)
    ) {
      await writeBuildRecord(state);
    }

    // Always write pipeline outcome for failure distribution tracking
    await writePipelineOutcome(state);

    console.log(`[graph-updater] Graph writes complete for gate=${gate}`);
  } catch (err: any) {
    console.warn(`[graph-updater] Unexpected error: ${err.message} — pipeline continues`);
  }

  // Never modify pipeline state — this is a side-effect-only node
  return {};
}

/**
 * Lightweight failure recorder — writes only PipelineOutcome to Neo4j.
 * Used on early-exit failure paths that bypass the full graph-updater.
 */
export async function failureRecorder(state: AESStateType): Promise<Partial<AESStateType>> {
  try {
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (ok) {
      await writePipelineOutcome(state);
      console.log(`[failure-recorder] PipelineOutcome written for ${state.jobId} (gate=${state.currentGate})`);
    }
  } catch (err: any) {
    console.warn(`[failure-recorder] Failed to write outcome: ${err.message}`);
  }
  return {};
}
