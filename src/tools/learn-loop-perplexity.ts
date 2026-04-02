/**
 * learn-loop-perplexity.ts — Test the knowledge graph against Perplexity research.
 *
 * Flow:
 *   1. Perplexity researches what a real app needs (already done, hardcoded below)
 *   2. We query the knowledge graph for its answer
 *   3. Compare: what did AES know vs what Perplexity says is actually needed
 *   4. Score each section, write gaps as corrections back to Neo4j
 *
 * This is a real test — Perplexity is the source of truth, not us.
 */

import { getNeo4jService } from "../services/neo4j-service.js";

let neo4j: ReturnType<typeof getNeo4jService>;
async function q(cypher: string): Promise<any[]> { try { return await neo4j.runCypher(cypher); } catch { return []; } }
function val(v: any): any { return v && typeof v === "object" && "low" in v ? v.low : v; }
function esc(s: string): string { return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n"); }

// ═══════════════════════════════════════════════════════════════════
// PERPLEXITY RESEARCH RESULTS (source of truth)
// App: "Barber shop appointment booking app"
// Based on: Booksy, Fresha, Square Appointments, Vagaro
// ═══════════════════════════════════════════════════════════════════

const PERPLEXITY = {
  app: "Barber shop appointment booking app",

  features: [
    "Appointment scheduling with real-time availability",
    "Client management / CRM with service history",
    "Point-of-sale integration",
    "Barber/staff management with commission tracking",
    "SMS & email reminders and notifications",
    "Loyalty program with digital stamp cards",
    "Walk-in waitlist management",
    "Marketing tools (promos, gift cards, email campaigns)",
    "Real-time calendar sync (Google, Outlook)",
    "Reporting and analytics dashboard",
    "Multi-location support",
    "Online payments and deposits",
    "Reviews and ratings",
    "Service menu with variable duration/pricing",
  ],

  models: [
    { name: "User", fields: "id, name, email, phone, timezone, created_at" },
    { name: "Barber", fields: "id, user_id, commission_rate, specialization, availability_status" },
    { name: "Service", fields: "id, name, description, base_price, duration_minutes" },
    { name: "Appointment", fields: "id, user_id, barber_id, service_id, location_id, start_time, end_time, status, notes" },
    { name: "Location", fields: "id, name, address, city, country, timezone" },
    { name: "Payment", fields: "id, booking_id, amount, payment_date, payment_method" },
    { name: "Review", fields: "id, user_id, service_id, rating, comment" },
    { name: "CancellationRefund", fields: "id, booking_id, cancellation_date, refund_amount" },
    { name: "AvailabilityWindow", fields: "id, barber_id, location_id, day_of_week, start_time, end_time" },
    { name: "LoyaltyCard", fields: "id, user_id, visit_count, stamps_earned, rewards_redeemed" },
    { name: "NotificationLog", fields: "id, user_id, type, delivery_status, sent_at" },
    { name: "PricingRule", fields: "id, service_id, condition, modifier_type, modifier_value" },
  ],

  integrations: [
    { name: "Stripe", type: "payment", why: "Credit card processing, digital wallets, refunds" },
    { name: "Square", type: "payment", why: "POS hardware integration, in-person + online payments" },
    { name: "Twilio", type: "sms", why: "SMS appointment reminders, 2-way messaging" },
    { name: "SendGrid", type: "email", why: "Transactional emails, marketing campaigns" },
    { name: "Google Calendar", type: "calendar", why: "Bidirectional appointment sync" },
    { name: "Firebase/PostgreSQL", type: "database", why: "Real-time data with offline support" },
    { name: "Google Analytics", type: "analytics", why: "Conversion funnels, user behavior" },
    { name: "Instagram", type: "social", why: "Book Now button, social booking" },
    { name: "Google Business", type: "social", why: "Appointment slots in search results" },
  ],

  auth: [
    "JWT-based stateless auth with RS256",
    "Multi-tenant with org/shop ID in token",
    "Role-based access (owner, barber, customer)",
    "Password hashing with bcrypt (cost 10+)",
    "Social login (Google, Facebook)",
    "Optional 2FA/MFA",
  ],

  techStack: [
    "Next.js or React Native for mobile-first",
    "PostgreSQL for relational data integrity",
    "Redis for real-time availability caching",
    "WebSockets for live calendar updates",
    "Stripe/Square SDK for payments",
    "Tailwind CSS for responsive UI",
  ],

  userFlows: [
    "Customer booking: select service → pick barber → choose time → enter details → pay deposit → confirm",
    "Walk-in check-in: join virtual queue → get position → receive notification when ready",
    "Barber management: view schedule → accept/decline appointments → track earnings",
    "Loyalty: automatic visit tracking → earn stamps → redeem rewards",
    "Cancellation: cancel/reschedule → trigger refund logic → notify barber",
  ],

  uiPatterns: [
    "Calendar/time slot grid for availability",
    "Barber profile cards with ratings",
    "Service menu with price and duration",
    "Real-time queue/waitlist display",
    "Checkout/payment form",
    "Dashboard with charts (revenue, bookings, retention)",
    "Push notification preferences",
    "Dark mode support",
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEST SECTIONS — Query graph, compare to Perplexity
// ═══════════════════════════════════════════════════════════════════

interface TestResult {
  section: string;
  perplexity_count: number;
  graph_found: string[];
  graph_missing: string[];
  score: number;
  max_score: number;
}

async function testSection(
  name: string,
  perplexityItems: string[],
  cypher: string,
  matchField: string,
): Promise<TestResult> {
  const rows = await q(cypher);
  const graphText = rows.map(r => String(val(r[matchField]) || "")).join(" ||| ").toLowerCase();

  const found: string[] = [];
  const missing: string[] = [];

  for (const item of perplexityItems) {
    // Check if any keyword from the item appears in graph results
    const kws = item.toLowerCase().split(/[\s,/()]+/).filter(w => w.length > 3);
    const matched = kws.some(kw => graphText.includes(kw));
    if (matched) found.push(item);
    else missing.push(item);
  }

  const score = found.length;
  return { section: name, perplexity_count: perplexityItems.length, graph_found: found, graph_missing: missing, score, max_score: perplexityItems.length };
}

async function main() {
  neo4j = getNeo4jService();
  await neo4j.connect();

  const sessionId = `perplexity-test-${Date.now()}`;
  const results: TestResult[] = [];

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AES Knowledge Graph vs Perplexity Research");
  console.log("  App: Barber Shop Appointment Booking");
  console.log("  Source of truth: Perplexity (Booksy, Fresha, Square, Vagaro)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. FEATURES
  const featResult = await testSection(
    "FEATURES",
    PERPLEXITY.features,
    `MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
     WHERE a.app_class CONTAINS 'scheduling'
     RETURN f.name AS name ORDER BY f.file_count DESC LIMIT 30`,
    "name",
  );
  results.push(featResult);

  // Also check all features across all apps
  const featResult2 = await testSection(
    "FEATURES (all apps)",
    PERPLEXITY.features,
    `MATCH (f:LearnedFeature) WITH DISTINCT f.name AS name, f.file_count AS fc ORDER BY fc DESC LIMIT 100 RETURN name`,
    "name",
  );
  results.push(featResult2);

  // 2. DATA MODELS
  const modelNames = PERPLEXITY.models.map(m => m.name);
  const modelResult = await testSection(
    "DATA MODELS",
    modelNames,
    `MATCH (m:LearnedDataModel) WITH DISTINCT m.name AS name, m.field_count AS fc ORDER BY fc DESC RETURN name`,
    "name",
  );
  results.push(modelResult);

  // 3. INTEGRATIONS
  const intNames = PERPLEXITY.integrations.map(i => i.name);
  const intResult = await testSection(
    "INTEGRATIONS",
    intNames,
    `MATCH (i:LearnedIntegration)
     RETURN DISTINCT i.provider AS name ORDER BY i.provider`,
    "name",
  );
  results.push(intResult);

  // 4. AUTH PATTERNS
  const authResult = await testSection(
    "AUTH PATTERNS",
    PERPLEXITY.auth,
    `MATCH (p:LearnedPattern) WHERE p.type = 'auth'
     RETURN p.name AS name ORDER BY p.name`,
    "name",
  );
  results.push(authResult);

  // 5. TECH STACK
  const techResult = await testSection(
    "TECH STACK",
    PERPLEXITY.techStack,
    `MATCH (a:LearnedApp)
     RETURN a.framework + ' ' + a.database + ' ' + a.orm + ' ' + a.styling + ' ' + a.api_style AS name
     ORDER BY a.total_files DESC`,
    "name",
  );
  results.push(techResult);

  // 6. USER FLOWS
  const flowResult = await testSection(
    "USER FLOWS",
    PERPLEXITY.userFlows,
    `MATCH (uf:LearnedUserFlow)
     RETURN uf.name + ' ' + uf.steps AS name ORDER BY uf.name`,
    "name",
  );
  results.push(flowResult);

  // 7. UI PATTERNS
  const uiResult = await testSection(
    "UI PATTERNS",
    PERPLEXITY.uiPatterns,
    `MATCH (c:LearnedComponentGroup)
     RETURN c.name + ' ' + c.key_components AS name
     UNION
     MATCH (d:LearnedDesignSystem) RETURN d.css_framework + ' ' + d.component_library + ' ' + d.icon_library AS name
     UNION
     MATCH (sp:LearnedStatePattern) RETURN sp.component + ' ' + sp.type AS name`,
    "name",
  );
  results.push(uiResult);

  // ── Print Results ──
  let totalFound = 0, totalExpected = 0;

  for (const r of results) {
    const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0;
    const icon = pct >= 70 ? "✅" : pct >= 40 ? "⚠️" : "❌";
    console.log(`\n${icon} ${r.section}: ${r.score}/${r.max_score} (${pct}%)`);
    if (r.graph_found.length > 0) {
      console.log(`   ✓ AES knows: ${r.graph_found.join("; ")}`);
    }
    if (r.graph_missing.length > 0) {
      console.log(`   ✗ AES missing: ${r.graph_missing.join("; ")}`);
    }
    totalFound += r.score;
    totalExpected += r.max_score;
  }

  const overallPct = Math.round((totalFound / totalExpected) * 100);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  OVERALL: ${totalFound}/${totalExpected} (${overallPct}%)`);
  console.log(`${"═".repeat(60)}`);

  // ── Write all gaps as corrections to Neo4j ──
  let correctionCount = 0;
  for (const r of results) {
    for (const missing of r.graph_missing) {
      await q(`
        CREATE (c:LearnedCorrection {
          session_id: '${esc(sessionId)}',
          section: '${esc(r.section)}',
          correction: 'MISSING: ${esc(missing)}',
          source: 'perplexity-research',
          app_description: '${esc(PERPLEXITY.app)}',
          timestamp: '${esc(new Date().toISOString())}'
        })
        WITH c
        OPTIONAL MATCH (app:LearnedApp)
        WHERE toLower(app.name) CONTAINS 'barber'
           OR toLower(app.app_class) CONTAINS 'booking'
        WITH c, app LIMIT 1
        FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
          CREATE (app)-[:HAS_CORRECTION]->(c)
        )
        RETURN c.session_id
      `);
      correctionCount++;
    }

    // Write feedback record
    await q(`
      CREATE (f:LearnedFeedback {
        session_id: '${esc(sessionId)}',
        app_description: '${esc(PERPLEXITY.app)}',
        section: '${esc(r.section)}',
        score: ${r.score},
        max_score: ${r.max_score},
        pct: ${r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0},
        was_useful: ${r.score > 0},
        source: 'perplexity-research',
        matched: '${esc(r.graph_found.join("; "))}',
        missed: '${esc(r.graph_missing.join("; "))}',
        timestamp: '${esc(new Date().toISOString())}'
      })
      WITH f
      OPTIONAL MATCH (app:LearnedApp)
      WHERE toLower(app.name) CONTAINS 'barber'
         OR toLower(app.app_class) CONTAINS 'booking'
      WITH f, app LIMIT 1
      FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
        CREATE (app)-[:HAS_FEEDBACK]->(f)
      )
      RETURN f.session_id
    `);
  }

  // Write the Perplexity research itself as knowledge
  for (const model of PERPLEXITY.models) {
    await q(`
      MERGE (r:LearnedResearch {name: '${esc(model.name)}', domain: 'barber_booking', type: 'data_model'})
      SET r.fields = '${esc(model.fields)}',
          r.source = 'perplexity-research',
          r.timestamp = '${esc(new Date().toISOString())}'
      WITH r
      OPTIONAL MATCH (app:LearnedApp)
      WHERE toLower(app.name) CONTAINS 'barber'
         OR toLower(app.app_class) CONTAINS 'booking'
      WITH r, app LIMIT 1
      FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
        MERGE (app)-[:HAS_RESEARCH]->(r)
      )
      RETURN r.name
    `);
  }

  for (const int of PERPLEXITY.integrations) {
    await q(`
      MERGE (r:LearnedResearch {name: '${esc(int.name)}', domain: 'barber_booking', type: 'integration'})
      SET r.integration_type = '${esc(int.type)}',
          r.why = '${esc(int.why)}',
          r.source = 'perplexity-research',
          r.timestamp = '${esc(new Date().toISOString())}'
      WITH r
      OPTIONAL MATCH (app:LearnedApp)
      WHERE toLower(app.name) CONTAINS 'barber'
         OR toLower(app.app_class) CONTAINS 'booking'
      WITH r, app LIMIT 1
      FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
        MERGE (app)-[:HAS_RESEARCH]->(r)
      )
      RETURN r.name
    `);
  }

  for (const feat of PERPLEXITY.features) {
    await q(`
      MERGE (r:LearnedResearch {name: '${esc(feat)}', domain: 'barber_booking', type: 'feature'})
      SET r.source = 'perplexity-research',
          r.timestamp = '${esc(new Date().toISOString())}'
      WITH r
      OPTIONAL MATCH (app:LearnedApp)
      WHERE toLower(app.name) CONTAINS 'barber'
         OR toLower(app.app_class) CONTAINS 'booking'
      WITH r, app LIMIT 1
      FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
        MERGE (app)-[:HAS_RESEARCH]->(r)
      )
      RETURN r.name
    `);
  }

  for (const flow of PERPLEXITY.userFlows) {
    await q(`
      MERGE (r:LearnedResearch {name: '${esc(flow.slice(0, 50))}', domain: 'barber_booking', type: 'user_flow'})
      SET r.description = '${esc(flow)}',
          r.source = 'perplexity-research',
          r.timestamp = '${esc(new Date().toISOString())}'
      WITH r
      OPTIONAL MATCH (app:LearnedApp)
      WHERE toLower(app.name) CONTAINS 'barber'
         OR toLower(app.app_class) CONTAINS 'booking'
      WITH r, app LIMIT 1
      FOREACH (_ IN CASE WHEN app IS NOT NULL THEN [1] ELSE [] END |
        MERGE (app)-[:HAS_RESEARCH]->(r)
      )
      RETURN r.name
    `);
  }

  // Summary
  const totalCorrections = await q(`MATCH (c:LearnedCorrection) RETURN count(c) AS total`);
  const totalResearch = await q(`MATCH (r:LearnedResearch) RETURN count(r) AS total`);

  console.log(`\n  Written to Neo4j:`);
  console.log(`    ${correctionCount} corrections (gaps AES needs to learn)`);
  console.log(`    ${PERPLEXITY.models.length + PERPLEXITY.integrations.length + PERPLEXITY.features.length + PERPLEXITY.userFlows.length} research nodes (Perplexity's ground truth)`);
  console.log(`\n  Cumulative knowledge graph:`);
  console.log(`    ${val(totalCorrections[0]?.total || 0)} total corrections`);
  console.log(`    ${val(totalResearch[0]?.total || 0)} total research nodes`);
  console.log(`\n  Next time AES plans a barber booking app, it can query`);
  console.log(`  LearnedResearch + LearnedCorrection to fill the gaps.\n`);

  await neo4j.close();
}

main().catch(console.error);
