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
export interface EntityNode {
    entity_id: string;
    name: string;
    system: string;
    entity_type: "architecture_decision" | "rule" | "feature_spec" | "contract" | "policy";
    created_at: string;
}
export interface VersionNode {
    version_id: string;
    version_number: number;
    status: "current" | "superseded" | "draft" | "rejected";
    created_at: string;
    promoted_at?: string;
    promoted_reason?: string;
    promoted_actor?: string;
    superseded_at?: string;
    snapshot_name: string;
    snapshot_description: string;
    snapshot_text?: string;
    snapshot_keywords?: string[];
}
export interface ChangeEventNode {
    event_id: string;
    entity_id: string;
    from_version: number;
    to_version: number;
    change_type: "creation" | "enhancement" | "replacement" | "bugfix" | "migration" | "deprecation";
    reason: string;
    actor: string;
    created_at: string;
    evidence_sources?: string[];
}
/**
 * Generate Cypher to create a new versioned entity with its first version.
 * Use this when introducing a brand new truth-bearing entity.
 */
export declare function cypherCreateEntity(entity: EntityNode, firstVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at">, decisionNodeName: string): string;
/**
 * Generate Cypher to promote a new version of an existing entity.
 * This is the core write operation: old current → superseded, new → current.
 */
export declare function cypherPromoteVersion(entityId: string, newVersion: {
    version_id: string;
    snapshot_name: string;
    snapshot_description: string;
    snapshot_text?: string;
}, changeEvent: {
    change_type: ChangeEventNode["change_type"];
    reason: string;
    actor: string;
    evidence_sources?: string[];
}, newDecisionNodeName: string): string;
/**
 * Generate Cypher to link evidence to a ChangeEvent.
 */
export declare function cypherLinkEvidence(changeEventId: string, evidenceNodeName: string, evidenceLabel?: string): string;
/**
 * Resolve current truth for an entity. Returns the current version's snapshot.
 * This is THE canonical read path. Never use timestamp to guess current.
 */
export declare function cypherResolveCurrentTruth(entityId: string): string;
/**
 * Resolve current truth by system name (e.g. 'opsuite-approvals').
 */
export declare function cypherResolveBySystem(system: string): string;
/**
 * Get full version history for an entity, ordered newest first.
 */
export declare function cypherGetVersionHistory(entityId: string): string;
/**
 * Get a specific historical version.
 */
export declare function cypherGetVersion(entityId: string, versionNumber: number): string;
/**
 * Diff two versions of an entity — returns both snapshots side by side.
 */
export declare function cypherDiffVersions(entityId: string, fromVer: number, toVer: number): string;
/**
 * Validate all versioned truth invariants.
 * Returns violations — empty array means all invariants hold.
 */
export declare const INVARIANT_CHECKS: {
    name: string;
    cypher: string;
    expect: string;
}[];
/**
 * Generate Cypher to run all invariant checks in one pass.
 */
export declare function cypherRunAllInvariants(): string;
