/**
 * batch-learn.ts — Clone and scan multiple open-source apps into the knowledge graph.
 *
 * Clones repos to a temp directory, runs learn-app.ts on each, then cleans up.
 *
 * Usage:
 *   npx tsx src/tools/batch-learn.ts                          # scan all repos in the list
 *   npx tsx src/tools/batch-learn.ts --only crm,payments      # scan specific categories
 *   npx tsx src/tools/batch-learn.ts --dry-run                # show what would be scanned
 */
export {};
