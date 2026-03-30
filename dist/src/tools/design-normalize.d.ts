/**
 * design-normalize.ts — Single normalization gate for design evidence.
 *
 * Converts RawDesignEvidence (loose authoring format) into the canonical
 * DesignEvidence type. persistDesignEvidence() should only ever receive
 * the output of this function.
 *
 * Normalization rules:
 *   - IDs: fall back through alternative field names, then auto-generate from slugified name
 *   - Booleans: default to conservative values (false) when omitted
 *   - Arrays: default to [] when omitted
 *   - Strings: default to "" when omitted and no derivation is possible
 *   - implied_model: use source_hint if implied_model is missing
 *   - implied_operation: use api_hint if implied_operation is missing
 *   - is_destructive: derive from action type === "delete" if not set
 *   - is_primary: derive from being the first action on a screen with type "submit" if not set
 *   - explicit: default true for authored evidence
 *   - label (NavEdge): use nav_type if label is missing
 *   - label (Action): use name if label is missing
 *   - submit_label: use submit_text, or "Submit" as last resort
 */
import type { DesignEvidence } from "../types/design-evidence.js";
import type { RawDesignEvidence } from "../types/raw-design-evidence.js";
export declare function normalizeDesignEvidence(raw: RawDesignEvidence): DesignEvidence;
