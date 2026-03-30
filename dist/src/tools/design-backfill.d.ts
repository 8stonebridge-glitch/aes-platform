/**
 * design-backfill.ts — Idempotent repair for incomplete design evidence in Neo4j.
 *
 * Re-normalizes and re-persists design evidence, using MERGE semantics
 * so existing nodes get their missing properties populated without duplication.
 *
 * Usage:
 *   npx tsx src/tools/design-backfill.ts                         # backfill all known evidence
 *   npx tsx src/tools/design-backfill.ts --id <evidence_id>      # backfill specific evidence
 *   npx tsx src/tools/design-backfill.ts --json <file>           # backfill from JSON file
 *   npx tsx src/tools/design-backfill.ts --dry-run               # show what would change
 */
export {};
