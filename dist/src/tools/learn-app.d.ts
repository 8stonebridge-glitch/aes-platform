/**
 * learn-app.ts — Unified codebase learner (v2). Analyzes ALL layers of an existing
 * app and writes typed knowledge to Neo4j using the LearnedApp schema.
 *
 * v2 improvements: recursive discovery — finds schemas, components, pages, routes,
 * and integrations regardless of where they live in the repo structure.
 *
 * Layers:
 *   1. Tech Stack         — framework, DB, ORM, build tool, key packages
 *   2. Features           — feature modules with complexity, tests, API surface
 *   3. Data Models        — Prisma/Drizzle/TypeORM models with typed fields and relations
 *   4. Integrations       — third-party services with auth methods
 *   5. API Surface        — REST, tRPC, GraphQL, NestJS routes grouped by domain
 *   6. UI Components      — component library categorized by function
 *   7. Pages & Navigation — route structure, nav items, breadcrumbs
 *   8. Design System      — colors, typography, spacing, component lib
 *   9. User Flows         — onboarding, booking, settings, etc.
 *  10. Form Patterns      — validation, form library, multi-step
 *  11. State Patterns     — loading, empty, error, notification
 *  12. Auth Patterns      — login, roles, permissions, session management
 *  13. Testing Patterns   — test structure, frameworks, coverage approach
 *  14. Error Handling     — try/catch, error boundaries, retry logic
 *  15. Deployment Config  — Docker, CI/CD, env vars, infra
 *  16. Security Patterns  — CSP, sanitization, rate limiting
 *
 * Usage:
 *   npx tsx src/tools/learn-app.ts /path/to/codebase [--source-url=https://github.com/...]
 *
 * Output: Typed LearnedApp object → Neo4j nodes with proper labels
 */
import { type LearnedApp } from "../types/learned-knowledge.js";
export declare function analyzeApp(rootDir: string, sourceUrl?: string): LearnedApp;
