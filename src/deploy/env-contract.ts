/**
 * Defines the required environment variables for each service.
 * Used by the deployment system to validate config before deploying.
 */

export interface EnvRequirement {
  key: string;
  source: "clerk" | "convex" | "vercel" | "manual";
  required: boolean;
  description: string;
  example: string;
}

export const CLERK_ENV: EnvRequirement[] = [
  { key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", source: "clerk", required: false, description: "Clerk publishable key (optional — keyless mode works without)", example: "pk_test_..." },
  { key: "CLERK_SECRET_KEY", source: "clerk", required: false, description: "Clerk secret key (optional — keyless mode works without)", example: "sk_test_..." },
  { key: "NEXT_PUBLIC_CLERK_SIGN_IN_URL", source: "manual", required: false, description: "Sign-in page route (optional)", example: "/sign-in" },
  { key: "NEXT_PUBLIC_CLERK_SIGN_UP_URL", source: "manual", required: false, description: "Sign-up page route (optional)", example: "/sign-up" },
];

export const CONVEX_ENV: EnvRequirement[] = [
  { key: "NEXT_PUBLIC_CONVEX_URL", source: "convex", required: true, description: "Convex deployment URL", example: "https://your-project.convex.cloud" },
  { key: "CONVEX_DEPLOYMENT", source: "convex", required: true, description: "Convex deployment identifier", example: "dev:your-project" },
];

export const VERCEL_ENV: EnvRequirement[] = [
  { key: "VERCEL_TOKEN", source: "vercel", required: true, description: "Vercel API token for project management", example: "vercel_..." },
];

export const ALL_APP_ENV = [...CLERK_ENV, ...CONVEX_ENV];
export const ALL_PLATFORM_ENV = [...VERCEL_ENV];

/**
 * Validate that all required env vars are set.
 */
export function validateEnv(requirements: EnvRequirement[], env: Record<string, string | undefined>): { valid: boolean; missing: string[] } {
  const missing = requirements
    .filter(r => r.required && !env[r.key])
    .map(r => r.key);
  return { valid: missing.length === 0, missing };
}

/**
 * Generate .env.local content from requirements and provided values.
 */
export function generateEnvFile(requirements: EnvRequirement[], values: Record<string, string>): string {
  const lines: string[] = [];
  let lastSource = "";

  for (const req of requirements) {
    if (req.source !== lastSource) {
      if (lines.length > 0) lines.push("");
      lines.push(`# ${req.source.charAt(0).toUpperCase() + req.source.slice(1)}`);
      lastSource = req.source;
    }
    const value = values[req.key] || req.example;
    lines.push(`${req.key}=${value}`);
  }

  return lines.join("\n") + "\n";
}
