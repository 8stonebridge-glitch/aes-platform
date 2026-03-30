/**
 * Versioned Truth System for AES Graph
 *
 * Implements governed version history for truth-bearing entities in Neo4j.
 *
 * Model:
 *   Entity (stable root) -[:HAS_VERSION]-> Version (immutable snapshot)
 *                         -[:CURRENT_VERSION]-> Version (exactly one)
 *                         -[:HAS_CHANGE]-> ChangeEvent (why it changed)
 *
 *   ChangeEvent -[:FROM_VERSION]-> Version (old)
 *               -[:TO_VERSION]-> Version (new)
 *               -[:EVIDENCE]-> Decision|Evidence|Research (provenance)
 *
 * Rules:
 *   - Never overwrite truth-bearing entities in place
 *   - Each change creates a new Version + ChangeEvent
 *   - Exactly one CURRENT_VERSION per Entity
 *   - Old current becomes superseded when new current is promoted
 *   - Runtime resolves current truth via CURRENT_VERSION, never by timestamp
 */
// ─── Write Path ──────────────────────────────────────────────────────
/**
 * Generate Cypher to create a new versioned entity with its first version.
 * Use this when introducing a brand new truth-bearing entity.
 */
export function cypherCreateEntity(entity, firstVersion, decisionNodeName) {
    return `
// Create Entity root
MERGE (e:Entity {entity_id: '${entity.entity_id}'})
SET e.name = '${esc(entity.name)}',
    e.system = '${esc(entity.system)}',
    e.entity_type = '${entity.entity_type}',
    e.created_at = '${entity.created_at}'

// Create Version 1
WITH e
MERGE (v:Version {version_id: '${firstVersion.version_id}'})
SET v.version_number = 1,
    v.status = 'current',
    v.created_at = '${firstVersion.created_at}',
    v.promoted_at = '${firstVersion.created_at}',
    v.promoted_reason = 'Initial version',
    v.promoted_actor = '${firstVersion.promoted_actor || "system"}',
    v.snapshot_name = '${esc(firstVersion.snapshot_name)}',
    v.snapshot_description = '${esc(firstVersion.snapshot_description)}'

// Wire relationships
MERGE (e)-[:HAS_VERSION]->(v)
MERGE (e)-[:CURRENT_VERSION]->(v)

// Link to Decision node
WITH e, v
MATCH (d:Decision {name: '${esc(decisionNodeName)}'})
MERGE (v)-[:SNAPSHOT_OF]->(d)

// Create initial ChangeEvent
WITH e, v
MERGE (ce:ChangeEvent {event_id: 'chg-${entity.entity_id}-v0-to-v1'})
SET ce.entity_id = '${entity.entity_id}',
    ce.from_version = 0,
    ce.to_version = 1,
    ce.change_type = 'creation',
    ce.reason = 'Initial creation',
    ce.actor = '${firstVersion.promoted_actor || "system"}',
    ce.created_at = '${firstVersion.created_at}'
MERGE (ce)-[:TO_VERSION]->(v)
MERGE (e)-[:HAS_CHANGE]->(ce)

RETURN e.entity_id, v.version_id, 'created' as status
`.trim();
}
/**
 * Generate Cypher to promote a new version of an existing entity.
 * This is the core write operation: old current → superseded, new → current.
 */
export function cypherPromoteVersion(entityId, newVersion, changeEvent, newDecisionNodeName) {
    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const evidenceArr = changeEvent.evidence_sources
        ? `[${changeEvent.evidence_sources.map(s => `'${esc(s)}'`).join(", ")}]`
        : "[]";
    return `
// 1. Find entity and its current version
MATCH (e:Entity {entity_id: '${entityId}'})
MATCH (e)-[cur_rel:CURRENT_VERSION]->(old_v:Version)

// 2. Get next version number
WITH e, old_v, cur_rel, old_v.version_number + 1 AS next_ver

// 3. Supersede old current
SET old_v.status = 'superseded',
    old_v.superseded_at = '${now}'

// 4. Remove old CURRENT_VERSION relationship
DELETE cur_rel

// 5. Create new version
WITH e, old_v, next_ver
MERGE (new_v:Version {version_id: '${newVersion.version_id}'})
SET new_v.version_number = next_ver,
    new_v.status = 'current',
    new_v.created_at = '${now}',
    new_v.promoted_at = '${now}',
    new_v.promoted_reason = '${esc(changeEvent.reason)}',
    new_v.promoted_actor = '${esc(changeEvent.actor)}',
    new_v.snapshot_name = '${esc(newVersion.snapshot_name)}',
    new_v.snapshot_description = '${esc(newVersion.snapshot_description)}'${newVersion.snapshot_text
        ? `,\n    new_v.snapshot_text = '${esc(newVersion.snapshot_text)}'`
        : ""}

// 6. Wire new CURRENT_VERSION
MERGE (e)-[:HAS_VERSION]->(new_v)
MERGE (e)-[:CURRENT_VERSION]->(new_v)

// 7. Link to Decision node
WITH e, old_v, new_v, next_ver
OPTIONAL MATCH (d:Decision {name: '${esc(newDecisionNodeName)}'})
FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |
  MERGE (new_v)-[:SNAPSHOT_OF]->(d)
)

// 8. Create ChangeEvent
WITH e, old_v, new_v, next_ver
MERGE (ce:ChangeEvent {event_id: 'chg-${entityId}-v' + toString(next_ver - 1) + '-to-v' + toString(next_ver)})
SET ce.entity_id = '${entityId}',
    ce.from_version = next_ver - 1,
    ce.to_version = next_ver,
    ce.change_type = '${changeEvent.change_type}',
    ce.reason = '${esc(changeEvent.reason)}',
    ce.actor = '${esc(changeEvent.actor)}',
    ce.created_at = '${now}',
    ce.evidence_sources = ${evidenceArr}
MERGE (ce)-[:FROM_VERSION]->(old_v)
MERGE (ce)-[:TO_VERSION]->(new_v)
MERGE (e)-[:HAS_CHANGE]->(ce)

RETURN e.entity_id, new_v.version_number as promoted_version, old_v.version_number as superseded_version
`.trim();
}
/**
 * Generate Cypher to link evidence to a ChangeEvent.
 */
export function cypherLinkEvidence(changeEventId, evidenceNodeName, evidenceLabel = "Decision") {
    return `
MATCH (ce:ChangeEvent {event_id: '${changeEventId}'})
MATCH (ev:${evidenceLabel} {name: '${esc(evidenceNodeName)}'})
MERGE (ce)-[:EVIDENCE]->(ev)
RETURN ce.event_id, ev.name
`.trim();
}
// ─── Read Path ───────────────────────────────────────────────────────
/**
 * Resolve current truth for an entity. Returns the current version's snapshot.
 * This is THE canonical read path. Never use timestamp to guess current.
 */
export function cypherResolveCurrentTruth(entityId) {
    return `
MATCH (e:Entity {entity_id: '${entityId}'})
MATCH (e)-[:CURRENT_VERSION]->(v:Version)
OPTIONAL MATCH (v)-[:SNAPSHOT_OF]->(d:Decision)
RETURN e.entity_id, e.name, e.system,
       v.version_number, v.status, v.promoted_at, v.promoted_reason, v.promoted_actor,
       v.snapshot_name, v.snapshot_description, v.snapshot_text,
       d.name as decision_name, d.text as decision_text
`.trim();
}
/**
 * Resolve current truth by system name (e.g. 'opsuite-approvals').
 */
export function cypherResolveBySystem(system) {
    return `
MATCH (e:Entity {system: '${esc(system)}'})
MATCH (e)-[:CURRENT_VERSION]->(v:Version)
OPTIONAL MATCH (v)-[:SNAPSHOT_OF]->(d:Decision)
RETURN e.entity_id, e.name,
       v.version_number, v.promoted_at, v.promoted_reason,
       v.snapshot_name, v.snapshot_description,
       d.name as decision_name
ORDER BY e.name
`.trim();
}
/**
 * Get full version history for an entity, ordered newest first.
 */
export function cypherGetVersionHistory(entityId) {
    return `
MATCH (e:Entity {entity_id: '${entityId}'})
MATCH (e)-[:HAS_VERSION]->(v:Version)
OPTIONAL MATCH (e)-[:HAS_CHANGE]->(ce:ChangeEvent)-[:TO_VERSION]->(v)
RETURN v.version_number, v.status, v.created_at,
       v.promoted_at, v.promoted_reason, v.promoted_actor,
       v.superseded_at,
       v.snapshot_name, v.snapshot_description,
       ce.event_id, ce.change_type, ce.reason, ce.actor, ce.evidence_sources
ORDER BY v.version_number DESC
`.trim();
}
/**
 * Get a specific historical version.
 */
export function cypherGetVersion(entityId, versionNumber) {
    return `
MATCH (e:Entity {entity_id: '${entityId}'})
MATCH (e)-[:HAS_VERSION]->(v:Version {version_number: ${versionNumber}})
OPTIONAL MATCH (v)-[:SNAPSHOT_OF]->(d:Decision)
OPTIONAL MATCH (ce:ChangeEvent {entity_id: '${entityId}', to_version: ${versionNumber}})
RETURN e.entity_id, e.name,
       v.version_number, v.status, v.created_at, v.promoted_at, v.superseded_at,
       v.snapshot_name, v.snapshot_description, v.snapshot_text,
       d.name as decision_name, d.text as decision_text,
       ce.change_type, ce.reason, ce.actor, ce.evidence_sources
`.trim();
}
/**
 * Diff two versions of an entity — returns both snapshots side by side.
 */
export function cypherDiffVersions(entityId, fromVer, toVer) {
    return `
MATCH (e:Entity {entity_id: '${entityId}'})
MATCH (e)-[:HAS_VERSION]->(v_from:Version {version_number: ${fromVer}})
MATCH (e)-[:HAS_VERSION]->(v_to:Version {version_number: ${toVer}})
OPTIONAL MATCH (ce:ChangeEvent {entity_id: '${entityId}', from_version: ${fromVer}, to_version: ${toVer}})
RETURN {
  entity: e.name,
  from: {
    version: v_from.version_number,
    status: v_from.status,
    name: v_from.snapshot_name,
    description: v_from.snapshot_description
  },
  to: {
    version: v_to.version_number,
    status: v_to.status,
    name: v_to.snapshot_name,
    description: v_to.snapshot_description
  },
  change: {
    type: ce.change_type,
    reason: ce.reason,
    actor: ce.actor,
    evidence: ce.evidence_sources
  }
} as diff
`.trim();
}
// ─── Invariant Checks ────────────────────────────────────────────────
/**
 * Validate all versioned truth invariants.
 * Returns violations — empty array means all invariants hold.
 */
export const INVARIANT_CHECKS = [
    {
        name: "exactly-one-current-version",
        cypher: `
MATCH (e:Entity)
OPTIONAL MATCH (e)-[:CURRENT_VERSION]->(v:Version)
WITH e, count(v) as current_count
WHERE current_count <> 1
RETURN e.entity_id, e.name, current_count,
       CASE WHEN current_count = 0 THEN 'NO_CURRENT_VERSION'
            ELSE 'MULTIPLE_CURRENT_VERSIONS' END as violation
    `.trim(),
        expect: "Zero rows returned (every entity has exactly one CURRENT_VERSION)",
    },
    {
        name: "current-version-status-matches",
        cypher: `
MATCH (e:Entity)-[:CURRENT_VERSION]->(v:Version)
WHERE v.status <> 'current'
RETURN e.entity_id, e.name, v.version_number, v.status as actual_status,
       'CURRENT_REL_BUT_WRONG_STATUS' as violation
    `.trim(),
        expect: "Zero rows (CURRENT_VERSION target always has status='current')",
    },
    {
        name: "no-superseded-without-successor",
        cypher: `
MATCH (e:Entity)-[:HAS_VERSION]->(v:Version {status: 'superseded'})
WHERE NOT EXISTS {
  MATCH (e)-[:HAS_VERSION]->(next:Version)
  WHERE next.version_number = v.version_number + 1
}
RETURN e.entity_id, v.version_number, 'SUPERSEDED_WITHOUT_SUCCESSOR' as violation
    `.trim(),
        expect: "Zero rows (every superseded version has a successor)",
    },
    {
        name: "version-numbers-contiguous",
        cypher: `
MATCH (e:Entity)-[:HAS_VERSION]->(v:Version)
WITH e, collect(v.version_number) as versions
WITH e, versions, range(apoc.coll.min(versions), apoc.coll.max(versions)) as expected
WHERE size(versions) <> size(expected)
RETURN e.entity_id, e.name, versions, expected, 'VERSION_GAP' as violation
    `.trim(),
        expect: "Zero rows (version numbers are contiguous, no gaps)",
    },
    {
        name: "change-events-link-valid-versions",
        cypher: `
MATCH (ce:ChangeEvent)
WHERE ce.from_version > 0
AND NOT EXISTS {
  MATCH (ce)-[:FROM_VERSION]->(:Version)
}
RETURN ce.event_id, ce.entity_id, 'CHANGE_EVENT_MISSING_FROM_VERSION' as violation
UNION
MATCH (ce:ChangeEvent)
WHERE NOT EXISTS {
  MATCH (ce)-[:TO_VERSION]->(:Version)
}
RETURN ce.event_id, ce.entity_id, 'CHANGE_EVENT_MISSING_TO_VERSION' as violation
    `.trim(),
        expect: "Zero rows (every ChangeEvent links to valid Version nodes)",
    },
    {
        name: "current-is-highest-version",
        cypher: `
MATCH (e:Entity)-[:CURRENT_VERSION]->(cv:Version)
MATCH (e)-[:HAS_VERSION]->(v:Version)
WITH e, cv, max(v.version_number) as max_ver
WHERE cv.version_number <> max_ver
RETURN e.entity_id, cv.version_number as current_ver, max_ver, 'CURRENT_NOT_HIGHEST' as violation
    `.trim(),
        expect: "Zero rows (current version is always the highest version number)",
    },
];
/**
 * Generate Cypher to run all invariant checks in one pass.
 */
export function cypherRunAllInvariants() {
    return INVARIANT_CHECKS.map(check => `// Invariant: ${check.name}\n${check.cypher}`).join("\n\nUNION ALL\n\n");
}
// ─── Helpers ─────────────────────────────────────────────────────────
function esc(s) {
    return s.replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
