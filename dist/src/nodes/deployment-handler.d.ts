/**
 * Deployment Handler — pushes to GitHub and deploys to Vercel.
 *
 * This is the last node in the pipeline. After building and validation:
 * 1. Creates a GitHub repo and pushes the generated app
 * 2. Creates a Vercel project linked to the GitHub repo
 * 3. Triggers deployment and waits for it to be ready
 * 4. Returns a live URL in state.deploymentUrl
 *
 * If deployment services are not configured (no tokens), the handler
 * completes gracefully — the build is still successful, just not deployed.
 */
import type { AESStateType } from "../state.js";
export declare function deploymentHandler(state: AESStateType): Promise<Partial<AESStateType>>;
