/**
 * reasoner-bench-runner.ts — Subprocess runner for autoresearch benchmarking.
 *
 * Called by autoresearch-loop.ts with a query and params (via env var).
 * Runs the unified reasoner and outputs structured JSON to stdout.
 *
 * Usage:
 *   AES_REASONER_PARAMS='{"beamWidth":6,...}' npx tsx src/tools/reasoner-bench-runner.ts "barber booking app"
 */
export {};
