/**
 * raw-design-evidence.ts — Loose authoring types for design evidence.
 *
 * These types accept alternative field names, missing defaults, and
 * optional derived fields. The normalizeDesignEvidence() function in
 * design-normalize.ts maps this shape into the canonical DesignEvidence
 * type before persistence.
 *
 * Rules:
 *   - Every field that has a canonical equivalent accepts both names
 *   - Boolean flags default to conservative values when omitted
 *   - Derived fields (implied_model, implied_operation) accept hints
 *   - Arrays default to [] when omitted
 */
export {};
