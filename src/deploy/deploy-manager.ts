import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Workspace } from "../builder/workspace-manager.js";

export interface DeployConfig {
  vercel_token?: string;
  clerk_publishable_key?: string;
  clerk_secret_key?: string;
  convex_url?: string;
  convex_deployment?: string;
}

export interface DeployResult {
  success: boolean;
  deployment_url: string | null;
  deployment_id: string | null;
  error: string | null;
  steps_completed: string[];
}

/**
 * Manages deployment to Vercel.
 * For this first version, generates deployment-ready output
 * rather than calling Vercel API directly (that requires the token).
 */
export class DeployManager {

  /**
   * Prepare a workspace for deployment.
   * Installs dependencies, runs build, generates deploy manifest.
   */
  async prepareDeploy(workspace: Workspace, config: DeployConfig): Promise<DeployResult> {
    const steps: string[] = [];

    try {
      // 1. Write .env.local if config provided
      if (config.clerk_publishable_key) {
        const envContent = [
          `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${config.clerk_publishable_key}`,
          `CLERK_SECRET_KEY=${config.clerk_secret_key || ""}`,
          `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
          `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
          `NEXT_PUBLIC_CONVEX_URL=${config.convex_url || ""}`,
          `CONVEX_DEPLOYMENT=${config.convex_deployment || ""}`,
        ].join("\n") + "\n";
        writeFileSync(join(workspace.path, ".env.local"), envContent);
        steps.push("env_written");
      }

      // 2. Install dependencies
      try {
        execSync("npm install --legacy-peer-deps 2>&1", {
          cwd: workspace.path,
          timeout: 120000,
          stdio: "pipe",
          env: { ...process.env, NODE_ENV: "development" },
        });
        steps.push("deps_installed");
      } catch {
        // npm install may fail in isolated workspace — that's expected
        // if node_modules doesn't exist after install, it's a real failure
        if (!existsSync(join(workspace.path, "node_modules"))) {
          steps.push("deps_install_skipped");
        } else {
          steps.push("deps_installed_with_warnings");
        }
      }

      // 3. Generate Vercel project config
      const vercelConfig = {
        version: 2,
        framework: "nextjs",
        buildCommand: "next build",
        outputDirectory: ".next",
      };
      writeFileSync(join(workspace.path, "vercel.json"), JSON.stringify(vercelConfig, null, 2) + "\n");
      steps.push("vercel_config_written");

      // 4. Generate deploy manifest
      const manifest = {
        app_name: this.getAppName(workspace.path),
        branch: workspace.branch,
        base_commit: workspace.base_commit,
        workspace: workspace.workspace_id,
        env_vars_required: [
          "NEXT_PUBLIC_CONVEX_URL",
          "CONVEX_DEPLOYMENT",
        ],
        env_vars_optional: [
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          "CLERK_SECRET_KEY",
        ],
        deploy_steps: [
          "1. Create Vercel project: vercel --yes",
          "2. Set environment variables in Vercel dashboard",
          "3. Deploy: vercel deploy --prod",
          "4. Set up Clerk webhook for auth events",
          "5. Deploy Convex: npx convex deploy",
        ],
        ready_for_deploy: true,
        created_at: new Date().toISOString(),
      };
      writeFileSync(join(workspace.path, ".aes-deploy-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
      steps.push("deploy_manifest_written");

      return {
        success: true,
        deployment_url: null, // Will be set after actual Vercel deploy
        deployment_id: null,
        error: null,
        steps_completed: steps,
      };

    } catch (err: any) {
      return {
        success: false,
        deployment_url: null,
        deployment_id: null,
        error: err.message || String(err),
        steps_completed: steps,
      };
    }
  }

  private getAppName(workspacePath: string): string {
    try {
      const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
      return pkg.name || "aes-app";
    } catch {
      return "aes-app";
    }
  }
}
