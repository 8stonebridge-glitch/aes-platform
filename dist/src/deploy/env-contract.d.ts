/**
 * Defines the required environment variables for each service.
 * Used by the deployment system to validate config before deploying.
 *
 * Updated for Supabase + Prisma + Caddy stack (replaces Clerk + Convex + Vercel).
 */
export interface EnvRequirement {
    key: string;
    source: "supabase" | "postgres" | "resend" | "google" | "manual";
    required: boolean;
    description: string;
    example: string;
}
export declare const SUPABASE_ENV: EnvRequirement[];
export declare const POSTGRES_ENV: EnvRequirement[];
export declare const RESEND_ENV: EnvRequirement[];
export declare const GOOGLE_ENV: EnvRequirement[];
export declare const INFRA_ENV: EnvRequirement[];
/** @deprecated Use SUPABASE_ENV */
export declare const CLERK_ENV: EnvRequirement[];
/** @deprecated Use POSTGRES_ENV */
export declare const CONVEX_ENV: EnvRequirement[];
/** @deprecated Vercel is no longer used */
export declare const VERCEL_ENV: EnvRequirement[];
export declare const ALL_APP_ENV: EnvRequirement[];
export declare const ALL_PLATFORM_ENV: EnvRequirement[];
/**
 * Validate that all required env vars are set.
 */
export declare function validateEnv(requirements: EnvRequirement[], env: Record<string, string | undefined>): {
    valid: boolean;
    missing: string[];
};
/**
 * Generate .env.production content from requirements and provided values.
 */
export declare function generateEnvFile(requirements: EnvRequirement[], values: Record<string, string>): string;
