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
import { readFileSync, readdirSync } from "node:fs";
import { normalizeDesignEvidence } from "./design-normalize.js";
import { persistDesignEvidence } from "./design-extract.js";
async function main() {
    const args = process.argv.slice(2);
    let targetId;
    let jsonFile;
    let dryRun = false;
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--id":
                targetId = args[++i];
                break;
            case "--json":
                jsonFile = args[++i];
                break;
            case "--dry-run":
                dryRun = true;
                break;
        }
    }
    const evidenceList = [];
    if (jsonFile) {
        // Load from specific JSON file
        const content = readFileSync(jsonFile, "utf-8");
        const parsed = JSON.parse(content);
        // Detect whether it's already normalized or raw
        const isNormalized = parsed.screens?.every((s) => typeof s.is_overlay === "boolean") &&
            parsed.components?.every((c) => typeof c.purpose === "string");
        if (isNormalized) {
            // Already canonical — re-persist as-is
            evidenceList.push(parsed);
        }
        else {
            // Raw — normalize first
            evidenceList.push(normalizeDesignEvidence(parsed));
        }
    }
    else {
        // Scan for design-evidence-*.json files in cwd
        const files = readdirSync(".")
            .filter((f) => f.startsWith("design-evidence-") && f.endsWith(".json"))
            .sort();
        if (files.length === 0) {
            console.log("[backfill] No design-evidence-*.json files found in cwd.");
            console.log("[backfill] Use --json <file> to specify a file, or run from the directory containing evidence JSON.");
            process.exit(0);
        }
        console.log(`[backfill] Found ${files.length} evidence files.`);
        for (const file of files) {
            const content = readFileSync(file, "utf-8");
            const parsed = JSON.parse(content);
            const eid = parsed.evidence_id ?? "unknown";
            if (targetId && eid !== targetId) {
                console.log(`[backfill] Skipping ${eid} (not target ${targetId})`);
                continue;
            }
            console.log(`[backfill] Processing ${file} (${eid})...`);
            // Always re-normalize to pick up any new derivation rules
            const normalized = normalizeDesignEvidence(parsed);
            evidenceList.push(normalized);
        }
    }
    if (evidenceList.length === 0) {
        console.log("[backfill] Nothing to backfill.");
        process.exit(0);
    }
    for (const evidence of evidenceList) {
        console.log(`\n[backfill] Evidence: ${evidence.evidence_id}`);
        console.log(`  Screens:    ${evidence.screens.length}`);
        console.log(`  Components: ${evidence.components.length}`);
        console.log(`  Data Views: ${evidence.data_views.length}`);
        console.log(`  Forms:      ${evidence.forms.length}`);
        console.log(`  Actions:    ${evidence.actions.length}`);
        console.log(`  States:     ${evidence.states.length}`);
        console.log(`  Nav Edges:  ${evidence.navigation.edges.length}`);
        if (dryRun) {
            console.log("  [DRY RUN] Would persist — skipping.");
            continue;
        }
        try {
            await persistDesignEvidence(evidence);
            console.log("  Persisted successfully.");
        }
        catch (err) {
            console.error(`  Failed to persist: ${err.message}`);
        }
    }
    console.log("\n[backfill] Done.");
}
main().catch((err) => {
    console.error("[backfill] Fatal:", err);
    process.exit(1);
});
