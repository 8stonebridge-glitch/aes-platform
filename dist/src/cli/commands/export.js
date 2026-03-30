import chalk from "chalk";
import { getJobStore } from "../../store.js";
import { compileBuilderPackage } from "../../builder-artifact.js";
export async function exportCommand(jobId, featureId) {
    const store = getJobStore();
    // Initialize persistence if needed
    if (!store.hasPersistence()) {
        const pgUrl = process.env.AES_POSTGRES_URL;
        if (pgUrl) {
            try {
                const { PersistenceLayer } = await import("../../persistence.js");
                const persistence = new PersistenceLayer(pgUrl);
                await persistence.initialize();
                store.setPersistence(persistence);
            }
            catch {
                // Continue without persistence
            }
        }
    }
    let job = store.get(jobId);
    if (!job) {
        job = (await store.loadFromPostgres(jobId)) || undefined;
    }
    if (!job) {
        console.error(chalk.red(`Job ${jobId} not found.`));
        process.exitCode = 1;
        return;
    }
    if (!job.featureBridges || Object.keys(job.featureBridges).length === 0) {
        console.error(chalk.red("No compiled bridges found in this job."));
        process.exitCode = 1;
        return;
    }
    // If no feature ID, list available features
    if (!featureId) {
        const featureIds = Object.keys(job.featureBridges);
        if (featureIds.length === 1) {
            featureId = featureIds[0];
        }
        else {
            console.log(chalk.yellow("Multiple features found. Specify a feature ID:"));
            for (const fId of featureIds) {
                const bridge = job.featureBridges[fId];
                console.log(`  ${chalk.cyan(fId)} — ${bridge.feature_name} (${bridge.status})`);
            }
            return;
        }
    }
    const pkg = compileBuilderPackage(job, featureId);
    if (!pkg) {
        console.error(chalk.red(`Cannot compile builder package for feature ${featureId}.`));
        console.error(chalk.gray("The bridge may not be approved, may have triggered vetoes, or is blocked."));
        process.exitCode = 1;
        return;
    }
    // Output as JSON to stdout
    console.log(JSON.stringify(pkg, null, 2));
}
