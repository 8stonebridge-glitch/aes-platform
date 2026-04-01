import { randomUUID } from "node:crypto";
import { CANARY_DEFINITIONS } from "../canary-definitions.js";
import { runGraph } from "../graph.js";
function parseArgs(argv) {
    const slug = argv[0];
    const deployTarget = argv.includes("--vercel") ? "vercel" :
        argv.includes("--cloudflare") ? "cloudflare" :
            "local";
    if (!slug || !(slug in CANARY_DEFINITIONS)) {
        const available = Object.keys(CANARY_DEFINITIONS).join(", ");
        throw new Error(`Usage: npx tsx src/tools/run-local-canary.ts <slug> [--vercel|--cloudflare]\nAvailable canaries: ${available}`);
    }
    return { slug, deployTarget: deployTarget };
}
async function main() {
    const { slug, deployTarget } = parseArgs(process.argv.slice(2));
    const canary = CANARY_DEFINITIONS[slug];
    const jobId = `local-canary-${slug}-${randomUUID().slice(0, 8)}`;
    const requestId = `local-canary-${randomUUID().slice(0, 8)}`;
    process.env.AES_LOCAL_CANARY_SKIP_REMOTE_DEPLOY = "true";
    console.log(`\n[AES] Running local canary "${canary.title}"`);
    console.log(`[AES] slug=${slug} deployTarget=${deployTarget} jobId=${jobId}\n`);
    const callbacks = {
        onGate: (gate, message) => console.log(`\n[GATE] ${gate} — ${message}`),
        onStep: (message) => console.log(`[STEP] ${message}`),
        onSuccess: (message) => console.log(`[OK] ${message}`),
        onFail: (message) => console.log(`[FAIL] ${message}`),
        onWarn: (message) => console.log(`[WARN] ${message}`),
        onPause: (message) => console.log(`[PAUSE] ${message}`),
        onFeatureStatus: (id, name, status) => console.log(`[FEATURE] ${id} ${name} => ${status}`),
        onNeedsApproval: async () => true,
        onNeedsConfirmation: async () => true,
    };
    const result = await runGraph({
        jobId,
        requestId,
        rawRequest: canary.description,
        currentGate: "gate_0",
        deployTarget,
        autonomous: true,
    }, callbacks);
    console.log("\n[AES] Final result");
    console.log(JSON.stringify({
        jobId,
        currentGate: result.currentGate,
        errorMessage: result.errorMessage ?? null,
        previewUrl: result.previewUrl ?? null,
        deploymentUrl: result.deploymentUrl ?? null,
    }, null, 2));
    if (result.currentGate === "failed" || result.errorMessage) {
        process.exitCode = 1;
    }
}
main().catch((err) => {
    console.error("[AES] Local canary runner failed:", err);
    process.exit(1);
});
