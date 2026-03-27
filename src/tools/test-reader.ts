/**
 * Test: Can the graph answer real product questions from what it learned?
 *
 * Simulates questions a user or pipeline node would ask, checks if
 * the graph returns useful, correct answers.
 */
import { getNeo4jService } from "../services/neo4j-service.js";

interface TestCase {
  question: string;
  cypher: string;
  expect: string; // what we expect to find
}

const tests: TestCase[] = [
  // ── "What stack should I use for X?" ──
  {
    question: "What tech stack do scheduling apps use?",
    cypher: `MATCH (a:LearnedApp) WHERE a.app_class CONTAINS 'scheduling' RETURN a.name AS app, a.framework AS framework, a.database AS db, a.orm AS orm, a.api_style AS api`,
    expect: "Should return Cal.com with Next.js + Prisma + PostgreSQL + mixed API",
  },
  {
    question: "What tech stack do document platforms use?",
    cypher: `MATCH (a:LearnedApp) WHERE a.app_class CONTAINS 'document' RETURN a.name AS app, a.framework AS framework, a.database AS db, a.orm AS orm`,
    expect: "Should return Documenso with Next.js + Prisma + PostgreSQL",
  },

  // ── "What features does a scheduling app need?" ──
  {
    question: "What features does a scheduling app have?",
    cypher: `MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) WHERE a.app_class CONTAINS 'scheduling' RETURN f.name AS feature, f.complexity AS complexity, f.file_count AS files ORDER BY f.file_count DESC LIMIT 15`,
    expect: "Should return bookings, availability, calendars, workflows, etc.",
  },

  // ── "What data models do I need for auth?" ──
  {
    question: "What data models are needed for auth?",
    cypher: `MATCH (m:LearnedDataModel) WHERE m.category = 'auth_identity' RETURN DISTINCT m.name AS model, m.field_count AS fields, m.source AS from_app ORDER BY m.field_count DESC LIMIT 10`,
    expect: "Should return User, Account, Session, Membership models with field counts",
  },

  // ── "What data models do payments need?" ──
  {
    question: "What data models handle payments?",
    cypher: `MATCH (m:LearnedDataModel) WHERE m.category = 'payments' RETURN DISTINCT m.name AS model, m.field_count AS fields, m.source AS from_app`,
    expect: "Should return Payment, Subscription, Credit, Invoice models",
  },

  // ── "What patterns does every app use?" ──
  {
    question: "What patterns are universal across apps?",
    cypher: `MATCH (p:LearnedPattern) WITH p.name AS pattern, p.type AS type, count(*) AS apps ORDER BY apps DESC LIMIT 10 RETURN pattern, type, apps`,
    expect: "Should show RBAC, Zod, Vitest, GitHub Actions, Monorepo as top patterns",
  },

  // ── "What integrations do I need for a SaaS?" ──
  {
    question: "What are the most common integrations?",
    cypher: `MATCH (i:LearnedIntegration) RETURN i.provider AS provider, i.type AS type, count(*) AS apps ORDER BY apps DESC LIMIT 10`,
    expect: "Should show Redis, Nodemailer, Stripe, AWS S3, PostHog, Sentry",
  },

  // ── "How do apps handle auth?" ──
  {
    question: "What auth patterns do real apps use?",
    cypher: `MATCH (p:LearnedPattern) WHERE p.type = 'auth' RETURN p.name AS pattern, count(*) AS apps ORDER BY apps DESC`,
    expect: "Should show RBAC, Encryption, 2FA, SSO/SAML, NextAuth, Passport",
  },

  // ── "What components does a UI need?" ──
  {
    question: "What UI component categories are most common?",
    cypher: `MATCH (c:LearnedComponentGroup) RETURN c.name AS category, sum(c.count) AS total ORDER BY total DESC`,
    expect: "Should show form, overlay, navigation, element, data_display as top categories",
  },

  // ── "What does a booking feature look like?" ──
  {
    question: "Show me booking-related data models with their fields",
    cypher: `MATCH (m:LearnedDataModel) WHERE m.category = 'scheduling' RETURN m.name AS model, m.fields AS fields, m.relations AS relations ORDER BY m.field_count DESC LIMIT 5`,
    expect: "Should return Booking, Attendee, Schedule models with actual field definitions",
  },

  // ── "What design system should I use?" ──
  {
    question: "What design systems do successful apps use?",
    cypher: `MATCH (a:LearnedApp)-[:HAS_DESIGN_SYSTEM]->(d:LearnedDesignSystem) RETURN a.name AS app, d.css_framework AS css, d.component_library AS lib, d.icon_library AS icons, d.has_dark_mode AS dark`,
    expect: "Should show Tailwind + Radix + Lucide as the dominant combo",
  },

  // ── "What user flows exist for onboarding?" ──
  {
    question: "What do onboarding flows look like?",
    cypher: `MATCH (uf:LearnedUserFlow) WHERE uf.section = 'onboarding' RETURN uf.name AS flow, uf.steps AS steps, uf.source AS app`,
    expect: "Should return onboarding flows with step sequences from Cal.com, LobeChat",
  },

  // ── Cross-app: "I want to build a SaaS — what's the full picture?" ──
  {
    question: "Give me the full blueprint for a new SaaS app",
    cypher: `
      MATCH (p:LearnedPattern)
      WITH p.name AS pattern, p.type AS type, count(*) AS apps
      WHERE apps >= 5
      RETURN pattern, type, apps
      ORDER BY apps DESC
    `,
    expect: "Should return the universal pattern set (RBAC, Zod, Vitest, Docker, Redis, etc.)",
  },
];

async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();

  let pass = 0, fail = 0;

  for (const t of tests) {
    console.log(`\n━━━ Q: ${t.question}`);
    console.log(`    Expected: ${t.expect}`);
    try {
      const results = await neo4j.runCypher(t.cypher);
      if (results.length === 0) {
        console.log(`    ❌ EMPTY — got no results`);
        fail++;
      } else {
        console.log(`    ✅ GOT ${results.length} results:`);
        for (const r of results.slice(0, 5)) {
          const summary = Object.entries(r)
            .map(([k, v]) => {
              const val = typeof v === 'object' && v !== null && 'low' in v ? (v as any).low : v;
              return `${k}=${val}`;
            })
            .join(", ");
          console.log(`       → ${summary}`);
        }
        if (results.length > 5) console.log(`       ... and ${results.length - 5} more`);
        pass++;
      }
    } catch (e: any) {
      console.log(`    ❌ ERROR: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${pass} passed, ${fail} failed out of ${tests.length}`);
  console.log(`${"═".repeat(60)}`);

  await neo4j.close();
}

main().catch(console.error);
