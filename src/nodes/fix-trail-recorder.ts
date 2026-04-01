import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import type { FixTrailEntry } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";
import {
  linkIncident,
  updatePatternFromIncident,
  recordFixApplication,
  type IncidentLink,
} from "@aes/failure-memory";
import type { FailurePattern } from "@aes/failure-memory";
import type { FixPattern } from "@aes/failure-memory";
import type { IncidentExample } from "@aes/failure-memory";

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
export async function fixTrailRecorder(
  state: AESStateType,
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  cb?.onGate("fix_trail", "Recording fix trail...");

  const buildResults = state.buildResults ?? {};
  const graphCtx = state.graphContext;
  const existingTrail = state.fixTrailEntries ?? [];
  const newEntries: FixTrailEntry[] = [];

  // Assemble known patterns and fixes from graph context
  const knownPatterns: FailurePattern[] = (graphCtx?.failureHistory ?? []).filter(
    (item: any) => item.pattern_id && item.failure_type,
  ) as FailurePattern[];

  const knownFixes: FixPattern[] = (graphCtx?.fixPatterns ?? []).filter(
    (item: any) => item.pattern_id && item.target_failure_patterns,
  ) as FixPattern[];

  // Track pattern and fix mutations for graph-updater
  const updatedPatterns: FailurePattern[] = [];
  const updatedFixes: FixPattern[] = [];
  const incidentLinks: IncidentLink[] = [];

  let fixesRecorded = 0;
  let incidentsLinked = 0;

  for (const [featureId, result] of Object.entries(buildResults)) {
    if (!result || typeof result !== "object") continue;
    const buildRun = result as Record<string, any>;

    // Look for repair events in build results
    // Common shapes: compile_repairs, fix_applications, repair_actions
    const repairEvents: Array<Record<string, any>> = [];

    // Collect from compile_repairs array if present
    if (Array.isArray(buildRun.compile_repairs)) {
      repairEvents.push(...buildRun.compile_repairs);
    }

    // Collect from fix_applications array if present
    if (Array.isArray(buildRun.fix_applications)) {
      repairEvents.push(...buildRun.fix_applications);
    }

    // Collect from repair_actions array if present
    if (Array.isArray(buildRun.repair_actions)) {
      repairEvents.push(...buildRun.repair_actions);
    }

    // If the build had errors that were repaired, record those
    if (buildRun.error_message && buildRun.status === "repaired") {
      repairEvents.push({
        error: buildRun.error_message,
        fix_action: buildRun.repair_summary ?? "Auto-repaired during build",
        files_changed: buildRun.files_modified ?? [],
        gate: "builder_dispatch",
      });
    }

    // If the build itself failed, record as an unresolved incident
    if (buildRun.error_message && buildRun.status === "failed") {
      repairEvents.push({
        error: buildRun.error_message,
        fix_action: null,
        files_changed: [],
        gate: "builder_dispatch",
        unresolved: true,
      });
    }

    for (const event of repairEvents) {
      const fixId = `fix-${randomUUID().slice(0, 8)}`;
      const errorCode = event.error_code ?? event.pattern ?? "build_repair";
      const isResolved = !event.unresolved;

      // Create a FixTrailEntry for audit lineage
      const trailEntry: FixTrailEntry = {
        fix_id: fixId,
        job_id: state.jobId,
        gate: event.gate ?? "builder_dispatch",
        error_code: errorCode,
        issue_summary: event.error ?? event.description ?? "Build repair event",
        root_cause: event.root_cause ?? event.diagnosis ?? "Identified during build",
        repair_action: event.fix_action ?? "No fix applied",
        status: isResolved ? "repaired" : "detected",
        related_artifact_ids: [featureId, ...(event.bridge_id ? [event.bridge_id] : [])],
        schema_version: CURRENT_SCHEMA_VERSION,
        created_at: new Date().toISOString(),
        resolved_at: isResolved ? new Date().toISOString() : null,
      };

      newEntries.push(trailEntry);
      store.addFixTrail(state.jobId, trailEntry);
      fixesRecorded++;

      // Build an IncidentExample for the incident-linker
      const incident: IncidentExample = {
        incident_id: fixId,
        title: `${errorCode}: ${(event.error ?? "").slice(0, 100)}`,
        description: event.error ?? event.description ?? "",
        failure_pattern_id: event.failure_pattern_id ?? "",
        fix_pattern_id: event.fix_pattern_id,
        occurred_at: new Date().toISOString(),
        resolved_at: isResolved ? new Date().toISOString() : undefined,
        severity: event.severity ?? "medium",
        affected_feature: featureId,
        affected_files: event.files_changed ?? [],
        resolution_notes: event.fix_action,
        tags: [
          errorCode,
          event.gate ?? "build",
          featureId,
          ...(event.tags ?? []),
        ].filter(Boolean),
      };

      // Link the incident to known patterns
      const link = linkIncident(incident, knownPatterns, knownFixes);
      incidentLinks.push(link);

      if (link.matched_pattern) {
        incidentsLinked++;
        const updatedPattern = updatePatternFromIncident(link.matched_pattern, incident);
        updatedPatterns.push(updatedPattern);

        trailEntry.root_cause = `Matched pattern: ${link.matched_pattern.name} (score: ${link.match_score.toFixed(2)})`;

        cb?.onStep(
          `Fix [${fixId}] linked to pattern "${link.matched_pattern.name}" ` +
          `(score: ${link.match_score.toFixed(2)})` +
          (link.suggested_fix_pattern_id
            ? ` — suggested fix: ${link.suggested_fix_pattern_id}`
            : ""),
        );

        // If a fix was applied and we matched a fix pattern, record the application
        if (isResolved && link.suggested_fix_pattern_id) {
          const matchedFix = knownFixes.find(
            (f) => f.pattern_id === link.suggested_fix_pattern_id,
          );
          if (matchedFix) {
            const updatedFix = recordFixApplication(matchedFix, true);
            updatedFixes.push(updatedFix);
          }
        }
      } else {
        cb?.onStep(
          `Fix [${fixId}] recorded for "${featureId}" — no known pattern match`,
        );
      }
    }
  }

  // Also scan existing fix trail entries from earlier gates (e.g., veto-checker)
  // that may not have been linked yet
  for (const existing of existingTrail) {
    if (existing.status !== "detected") continue;

    const incident: IncidentExample = {
      incident_id: existing.fix_id,
      title: existing.issue_summary,
      description: `${existing.error_code}: ${existing.root_cause}`,
      failure_pattern_id: "",
      occurred_at: existing.created_at,
      severity: "medium",
      affected_feature: existing.related_artifact_ids[1] ?? "",
      affected_files: [],
      tags: [existing.error_code, existing.gate].filter(Boolean),
    };

    const link = linkIncident(incident, knownPatterns, knownFixes);
    if (link.matched_pattern) {
      incidentsLinked++;
      const updatedPattern = updatePatternFromIncident(link.matched_pattern, incident);
      updatedPatterns.push(updatedPattern);
    }
    incidentLinks.push(link);
  }

  const allEntries = [...existingTrail, ...newEntries];

  // Summary
  const summary = `Fix trail: ${fixesRecorded} new entries recorded, ${incidentsLinked} linked to known patterns` +
    (updatedPatterns.length > 0 ? `, ${updatedPatterns.length} patterns updated` : "") +
    (updatedFixes.length > 0 ? `, ${updatedFixes.length} fix applications recorded` : "");

  store.addLog(state.jobId, {
    gate: "fix_trail",
    message: summary,
  });

  if (fixesRecorded > 0 || incidentsLinked > 0) {
    cb?.onSuccess(summary);
  } else {
    cb?.onStep("Fix trail: no new entries to record");
  }

  return {
    fixTrailEntries: allEntries,
    // Write updated patterns and fixes back to state so graph-updater
    // can persist the frequency/application-count changes
    ...(updatedPatterns.length > 0 || updatedFixes.length > 0
      ? {
          graphContext: {
            ...(state.graphContext ?? {}),
            failureHistory: mergePatterns(
              state.graphContext?.failureHistory ?? [],
              updatedPatterns,
            ),
            fixPatterns: mergeFixes(
              state.graphContext?.fixPatterns ?? [],
              updatedFixes,
            ),
          } as AESStateType["graphContext"],
        }
      : {}),
  };
}

/**
 * Merge updated patterns back into the existing array, replacing by pattern_id.
 */
function mergePatterns(existing: any[], updated: FailurePattern[]): any[] {
  const map = new Map(existing.map((p: any) => [p.pattern_id, p]));
  for (const p of updated) {
    map.set(p.pattern_id, p);
  }
  return Array.from(map.values());
}

/**
 * Merge updated fixes back into the existing array, replacing by pattern_id.
 */
function mergeFixes(existing: any[], updated: FixPattern[]): any[] {
  const map = new Map(existing.map((f: any) => [f.pattern_id, f]));
  for (const f of updated) {
    map.set(f.pattern_id, f);
  }
  return Array.from(map.values());
}
