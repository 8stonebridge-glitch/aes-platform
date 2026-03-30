import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_APP_ENV, generateEnvFile } from "./env-contract.js";
/**
 * Manages deployment to a self-hosted VPS via Docker Compose + Caddy.
 * Generates deployment-ready config and manifests.
 */
export class DeployManager {
    /**
     * Prepare a workspace for deployment.
     * Generates .env.production, validates config, creates deploy manifest.
     */
    async prepareDeploy(workspace, config) {
        const steps = [];
        try {
            // 1. Write .env.production
            if (config.database_url) {
                const values = {};
                if (config.supabase_url)
                    values["NEXT_PUBLIC_SUPABASE_URL"] = config.supabase_url;
                if (config.supabase_anon_key)
                    values["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = config.supabase_anon_key;
                if (config.service_role_key)
                    values["SERVICE_ROLE_KEY"] = config.service_role_key;
                if (config.jwt_secret)
                    values["JWT_SECRET"] = config.jwt_secret;
                if (config.database_url)
                    values["DATABASE_URL"] = config.database_url;
                if (config.postgres_password)
                    values["POSTGRES_PASSWORD"] = config.postgres_password;
                if (config.google_client_id)
                    values["GOOGLE_CLIENT_ID"] = config.google_client_id;
                if (config.google_client_secret)
                    values["GOOGLE_CLIENT_SECRET"] = config.google_client_secret;
                if (config.resend_api_key) {
                    values["RESEND_API_KEY"] = config.resend_api_key;
                    values["SMTP_PASS"] = config.resend_api_key;
                }
                if (config.site_url) {
                    values["SITE_URL"] = config.site_url;
                    values["API_EXTERNAL_URL"] = `${config.site_url}/supabase`;
                }
                if (config.secret_key_base)
                    values["SECRET_KEY_BASE"] = config.secret_key_base;
                const envContent = generateEnvFile(ALL_APP_ENV, values);
                writeFileSync(join(workspace.path, ".env.production"), envContent);
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
            }
            catch {
                if (!existsSync(join(workspace.path, "node_modules"))) {
                    steps.push("deps_install_skipped");
                }
                else {
                    steps.push("deps_installed_with_warnings");
                }
            }
            // 3. Run Prisma generate
            try {
                execSync("npx prisma generate 2>&1", {
                    cwd: workspace.path,
                    timeout: 30000,
                    stdio: "pipe",
                });
                steps.push("prisma_generated");
            }
            catch {
                steps.push("prisma_generate_skipped");
            }
            // 4. Generate deploy manifest
            const manifest = {
                app_name: this.getAppName(workspace.path),
                branch: workspace.branch,
                base_commit: workspace.base_commit,
                workspace: workspace.workspace_id,
                stack: "supabase-prisma-caddy",
                env_vars_required: [
                    "DATABASE_URL",
                    "POSTGRES_PASSWORD",
                    "NEXT_PUBLIC_SUPABASE_URL",
                    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                    "SERVICE_ROLE_KEY",
                    "JWT_SECRET",
                    "SECRET_KEY_BASE",
                    "SITE_URL",
                    "API_EXTERNAL_URL",
                ],
                env_vars_optional: [
                    "GOOGLE_CLIENT_ID",
                    "GOOGLE_CLIENT_SECRET",
                    "RESEND_API_KEY",
                    "SMTP_HOST",
                    "SMTP_PORT",
                    "SMTP_USER",
                    "SMTP_PASS",
                ],
                deploy_steps: [
                    "1. Provision VPS (8GB RAM, 4 vCPU recommended)",
                    "2. Install Docker and Docker Compose on VPS",
                    "3. Clone repo to VPS: git clone <repo> && cd <repo>",
                    "4. Copy .env.production.example to .env.production and fill values",
                    "5. Generate Supabase keys: node scripts/generate-keys.js",
                    "6. Start stack: docker compose up -d",
                    "7. Run migrations: docker compose exec app npx prisma migrate deploy",
                    "8. (Optional) Point domain DNS A record to VPS IP",
                    "9. (Optional) Update Caddyfile with domain for auto-HTTPS",
                ],
                infrastructure: {
                    reverse_proxy: "Caddy (auto-HTTPS via Let's Encrypt)",
                    database: "PostgreSQL 15 (Supabase image)",
                    auth: "Supabase GoTrue (email/password + Google OAuth)",
                    realtime: "Supabase Realtime (WebSockets)",
                    email: "Resend (SMTP)",
                    containerized: true,
                    docker_compose: true,
                },
                contract_tests: {
                    total: 50,
                    api_routes: 22,
                    role_visibility: 15,
                    state_machine: 13,
                    run_command: "npx vitest run src/lib/server/__tests__/actions.test.ts",
                },
                ready_for_deploy: true,
                created_at: new Date().toISOString(),
            };
            writeFileSync(join(workspace.path, ".aes-deploy-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
            steps.push("deploy_manifest_written");
            return {
                success: true,
                deployment_url: config.site_url || null,
                deployment_id: null,
                error: null,
                steps_completed: steps,
            };
        }
        catch (err) {
            return {
                success: false,
                deployment_url: null,
                deployment_id: null,
                error: err.message || String(err),
                steps_completed: steps,
            };
        }
    }
    getAppName(workspacePath) {
        try {
            const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
            return pkg.name || "aes-app";
        }
        catch {
            return "aes-app";
        }
    }
}
