/**
 * Defines the required environment variables for each service.
 * Used by the deployment system to validate config before deploying.
 *
 * Updated for Supabase + Prisma + Caddy stack (replaces Clerk + Convex + Vercel).
 */
export const SUPABASE_ENV = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", source: "supabase", required: true, description: "Supabase API URL (self-hosted or cloud)", example: "http://localhost/supabase" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", source: "supabase", required: true, description: "Supabase anonymous key (public, respects RLS)", example: "eyJ..." },
    { key: "SERVICE_ROLE_KEY", source: "supabase", required: true, description: "Supabase service role key (server-only, bypasses RLS)", example: "eyJ..." },
    { key: "JWT_SECRET", source: "supabase", required: true, description: "JWT secret for Supabase auth tokens", example: "your-jwt-secret-at-least-32-chars" },
];
export const POSTGRES_ENV = [
    { key: "DATABASE_URL", source: "postgres", required: true, description: "PostgreSQL connection string for Prisma", example: "postgres://postgres:password@supabase-db:5432/opsuite" },
    { key: "POSTGRES_PASSWORD", source: "postgres", required: true, description: "PostgreSQL root password", example: "your-super-secret-password" },
];
export const RESEND_ENV = [
    { key: "RESEND_API_KEY", source: "resend", required: false, description: "Resend API key for transactional email", example: "re_..." },
    { key: "SMTP_HOST", source: "resend", required: false, description: "SMTP host for Supabase GoTrue emails", example: "smtp.resend.com" },
    { key: "SMTP_PORT", source: "resend", required: false, description: "SMTP port", example: "465" },
    { key: "SMTP_USER", source: "resend", required: false, description: "SMTP username", example: "resend" },
    { key: "SMTP_PASS", source: "resend", required: false, description: "SMTP password (same as RESEND_API_KEY)", example: "re_..." },
    { key: "SMTP_SENDER_NAME", source: "resend", required: false, description: "From name for emails", example: "OpSuite" },
    { key: "SMTP_ADMIN_EMAIL", source: "resend", required: false, description: "From email address", example: "noreply@yourdomain.com" },
];
export const GOOGLE_ENV = [
    { key: "GOOGLE_CLIENT_ID", source: "google", required: false, description: "Google OAuth client ID", example: "123456.apps.googleusercontent.com" },
    { key: "GOOGLE_CLIENT_SECRET", source: "google", required: false, description: "Google OAuth client secret", example: "GOCSPX-..." },
];
export const INFRA_ENV = [
    { key: "SITE_URL", source: "manual", required: true, description: "Public URL of the app", example: "http://localhost" },
    { key: "API_EXTERNAL_URL", source: "manual", required: true, description: "Public URL of the Supabase API", example: "http://localhost/supabase" },
    { key: "SECRET_KEY_BASE", source: "manual", required: true, description: "Erlang secret for Supabase Realtime", example: "your-secret-key-base-64-chars" },
];
// ─── Legacy aliases (for backward compatibility during migration) ────
/** @deprecated Use SUPABASE_ENV */
export const CLERK_ENV = [];
/** @deprecated Use POSTGRES_ENV */
export const CONVEX_ENV = [];
/** @deprecated Vercel is no longer used */
export const VERCEL_ENV = [];
// ─── Combined sets ──────────────────────────────────────────────────
export const ALL_APP_ENV = [...SUPABASE_ENV, ...POSTGRES_ENV, ...RESEND_ENV, ...GOOGLE_ENV, ...INFRA_ENV];
export const ALL_PLATFORM_ENV = []; // No external platform (self-hosted)
/**
 * Validate that all required env vars are set.
 */
export function validateEnv(requirements, env) {
    const missing = requirements
        .filter(r => r.required && !env[r.key])
        .map(r => r.key);
    return { valid: missing.length === 0, missing };
}
/**
 * Generate .env.production content from requirements and provided values.
 */
export function generateEnvFile(requirements, values) {
    const lines = [];
    let lastSource = "";
    for (const req of requirements) {
        if (req.source !== lastSource) {
            if (lines.length > 0)
                lines.push("");
            lines.push(`# ${req.source.charAt(0).toUpperCase() + req.source.slice(1)}`);
            lastSource = req.source;
        }
        const value = values[req.key] || req.example;
        lines.push(`${req.key}=${value}`);
    }
    return lines.join("\n") + "\n";
}
