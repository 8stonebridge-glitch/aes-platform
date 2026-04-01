import type { AESStateType } from "../state.js";
/**
 * Fix Trail Recorder — scans buildResults for fix trail entries, links
 * incidents to known failure patterns via the failure-memory incident-linker,
 * and writes fix applications back to state for graph-updater to persist.
 *
 * This node runs after the builder and validator stages.  It:
 * 1. Iterates over buildResults to find repair/fix events
 * 2. Converts each into an IncidentExample
 * 3. Uses linkIncident() to match against graphContext.fixPatterns
 *    and known failure patterns from graphContext.failureHistory
 * 4. Records linked fix trail entries into state.fixTrailEntries
 * 5. Surfaces updated pattern frequency and fix application counts
 *    so graph-updater can persist them
 */
export declare function fixTrailRecorder(state: AESStateType): Promise<Partial<AESStateType>>;
