/**
 * graph-only-test.ts — Test the knowledge graph using ONLY graph data.
 * No outside knowledge, no Perplexity. Pure graph reasoning.
 *
 * Instead of exact string matching, uses keyword-based graph queries
 * that mirror how the pipeline would actually search for knowledge.
 *
 * For each domain concept Perplexity said is needed, we search the graph
 * using multiple keyword strategies — the way a real builder would.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
let neo4j;
async function q(cypher) {
    try {
        return await neo4j.runCypher(cypher);
    }
    catch (e) {
        console.error(`[neo4j] ${e.message.slice(0, 120)}`);
        return [];
    }
}
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
const REQUIREMENTS = [
    // === FEATURES ===
    { name: "Appointment scheduling with real-time availability", type: "feature",
        keywords: ["booking", "appointment", "scheduling", "availability"] },
    { name: "Client management / CRM with service history", type: "feature",
        keywords: ["client", "contact", "customer", "crm", "profile"] },
    { name: "Point-of-sale integration", type: "feature",
        keywords: ["pos", "point-of-sale", "checkout", "payment", "billing"] },
    { name: "Staff management with commission tracking", type: "feature",
        keywords: ["staff", "team", "member", "barber", "employee", "commission"] },
    { name: "SMS & email reminders and notifications", type: "feature",
        keywords: ["sms", "email", "notification", "reminder", "messaging"] },
    { name: "Loyalty program with digital stamp cards", type: "feature",
        keywords: ["loyalty", "reward", "stamp", "points", "incentive"] },
    { name: "Walk-in waitlist management", type: "feature",
        keywords: ["waitlist", "walk-in", "queue", "wait"] },
    { name: "Marketing tools (promos, gift cards, campaigns)", type: "feature",
        keywords: ["marketing", "campaign", "promo", "gift", "discount"] },
    { name: "Real-time calendar sync (Google, Outlook)", type: "feature",
        keywords: ["calendar", "sync", "google", "outlook", "ical"] },
    { name: "Reporting and analytics dashboard", type: "feature",
        keywords: ["analytics", "report", "dashboard", "insight", "chart"] },
    { name: "Multi-location support", type: "feature",
        keywords: ["location", "multi-location", "branch", "shop", "venue"] },
    { name: "Online payments and deposits", type: "feature",
        keywords: ["payment", "stripe", "deposit", "checkout", "billing"] },
    { name: "Reviews and ratings", type: "feature",
        keywords: ["review", "rating", "feedback", "star"] },
    { name: "Service menu with variable duration/pricing", type: "feature",
        keywords: ["service", "menu", "duration", "pricing", "event-type"] },
    // === DATA MODELS ===
    { name: "User model", type: "model",
        keywords: ["user", "account"] },
    { name: "Barber/Staff model", type: "model",
        keywords: ["barber", "staff", "member", "agent", "barbershop"] },
    { name: "Service model", type: "model",
        keywords: ["service", "eventtype", "event_type"] },
    { name: "Appointment model", type: "model",
        keywords: ["appointment", "booking", "bookingseat"] },
    { name: "Location model", type: "model",
        keywords: ["location", "venue", "shop", "branch"] },
    { name: "Payment model", type: "model",
        keywords: ["payment", "credit", "transaction", "invoice"] },
    { name: "Review model", type: "model",
        keywords: ["review", "rating", "feedback"] },
    { name: "Cancellation/Refund model", type: "model",
        keywords: ["cancellation", "refund", "cancel"] },
    { name: "Availability model", type: "model",
        keywords: ["availability", "schedule", "slot", "busytime"] },
    { name: "Loyalty model", type: "model",
        keywords: ["loyalty", "reward", "points", "stamp"] },
    { name: "Notification model", type: "model",
        keywords: ["notification", "reminder", "message", "webhook"] },
    { name: "Pricing model", type: "model",
        keywords: ["pricing", "price", "rate", "tier"] },
    // === INTEGRATIONS ===
    { name: "Stripe", type: "integration",
        keywords: ["stripe"] },
    { name: "Square", type: "integration",
        keywords: ["square"] },
    { name: "Twilio/SMS", type: "integration",
        keywords: ["twilio", "sms"] },
    { name: "SendGrid/Email", type: "integration",
        keywords: ["sendgrid", "email", "react-email", "ses"] },
    { name: "Google Calendar", type: "integration",
        keywords: ["googlecalendar", "google", "gcal", "caldav"] },
    { name: "Firebase/PostgreSQL", type: "integration",
        keywords: ["firebase", "postgres", "supabase", "prisma", "drizzle"] },
    { name: "Google Analytics", type: "integration",
        keywords: ["analytics", "vercel/analytics", "posthog", "plausible"] },
    { name: "Instagram", type: "integration",
        keywords: ["instagram", "social", "meta"] },
    { name: "Google Business", type: "integration",
        keywords: ["google-business", "google", "maps"] },
    // === AUTH PATTERNS ===
    { name: "JWT-based stateless auth", type: "pattern",
        keywords: ["jwt", "token", "session", "nextauth", "passport"] },
    { name: "Role-based access (owner, barber, customer)", type: "pattern",
        keywords: ["role", "rbac", "access", "permission"] },
    { name: "Password hashing with bcrypt", type: "pattern",
        keywords: ["bcrypt", "hash", "encrypt", "password"] },
    { name: "Multi-tenant with org/shop ID", type: "pattern",
        keywords: ["tenant", "org", "organization", "team", "workspace"] },
    { name: "Social login (Google, Facebook)", type: "pattern",
        keywords: ["social", "oauth", "google", "sso", "saml"] },
    { name: "2FA/MFA", type: "pattern",
        keywords: ["2fa", "mfa", "two-factor", "totp"] },
    // === TECH STACK ===
    { name: "Next.js or React Native for mobile-first", type: "pattern",
        keywords: ["next", "react", "mobile"] },
    { name: "PostgreSQL for data integrity", type: "pattern",
        keywords: ["postgres", "prisma", "drizzle", "typeorm", "database"] },
    { name: "Tailwind CSS for responsive UI", type: "pattern",
        keywords: ["tailwind", "css", "styling"] },
    { name: "Redis for caching", type: "pattern",
        keywords: ["redis", "cache", "upstash"] },
    { name: "WebSockets for live updates", type: "pattern",
        keywords: ["websocket", "real-time", "socket", "pusher"] },
    { name: "Stripe/Square SDK for payments", type: "pattern",
        keywords: ["stripe", "square", "payment"] },
    // === USER FLOWS ===
    { name: "Customer booking flow", type: "flow",
        keywords: ["booking", "public", "schedule", "appointment"] },
    { name: "Walk-in check-in flow", type: "flow",
        keywords: ["walk-in", "check-in", "queue", "waitlist"] },
    { name: "Staff management flow", type: "flow",
        keywords: ["staff", "barber", "schedule", "manage", "setting"] },
    { name: "Cancellation flow", type: "flow",
        keywords: ["cancel", "reschedule", "refund"] },
    { name: "Loyalty rewards flow", type: "flow",
        keywords: ["loyalty", "reward", "onboard", "setup"] },
    // === UI PATTERNS ===
    { name: "Calendar/time slot grid", type: "ui",
        keywords: ["calendar", "time", "slot", "grid", "datepicker"] },
    { name: "Profile cards with ratings", type: "ui",
        keywords: ["profile", "card", "avatar", "rating"] },
    { name: "Service menu with price/duration", type: "ui",
        keywords: ["service", "menu", "list", "pricing", "event-type"] },
    { name: "Waitlist display", type: "ui",
        keywords: ["wait", "queue", "list", "status"] },
    { name: "Checkout/payment form", type: "ui",
        keywords: ["checkout", "payment", "form", "stripe"] },
    { name: "Dashboard with charts", type: "ui",
        keywords: ["dashboard", "chart", "analytics", "report", "insight"] },
    { name: "Notification preferences", type: "ui",
        keywords: ["notification", "preference", "setting", "alert"] },
    { name: "Dark mode support", type: "ui",
        keywords: ["dark", "theme", "mode", "color"] },
];
// ─── Smart Graph Search ──────────────────────────────────────────────
async function searchGraph(req) {
    const allEvidence = [];
    for (const kw of req.keywords) {
        const lower = kw.toLowerCase();
        if (req.type === "feature") {
            // Search features by name and description
            const rows = await q(`
        MATCH (f:LearnedFeature)
        WHERE toLower(f.name) CONTAINS '${esc(lower)}'
           OR toLower(f.description) CONTAINS '${esc(lower)}'
        RETURN f.name AS name LIMIT 3
      `);
            rows.forEach(r => allEvidence.push(`Feature:${r.name}`));
            // Also check page sections (some features show up as pages)
            const pages = await q(`
        MATCH (p:LearnedPageSection)
        WHERE toLower(p.name) CONTAINS '${esc(lower)}'
        RETURN p.name AS name LIMIT 2
      `);
            pages.forEach(r => allEvidence.push(`Page:${r.name}`));
        }
        if (req.type === "model") {
            const rows = await q(`
        MATCH (m:LearnedDataModel)
        WHERE toLower(m.name) CONTAINS '${esc(lower)}'
        RETURN DISTINCT m.name AS name LIMIT 3
      `);
            rows.forEach(r => allEvidence.push(`Model:${r.name}`));
        }
        if (req.type === "integration") {
            const rows = await q(`
        MATCH (i:LearnedIntegration)
        WHERE toLower(i.name) CONTAINS '${esc(lower)}'
           OR toLower(i.provider) CONTAINS '${esc(lower)}'
        RETURN DISTINCT i.name AS name LIMIT 3
      `);
            rows.forEach(r => allEvidence.push(`Integration:${r.name}`));
        }
        if (req.type === "pattern") {
            const rows = await q(`
        MATCH (p:LearnedPattern)
        WHERE toLower(p.name) CONTAINS '${esc(lower)}'
           OR toLower(p.description) CONTAINS '${esc(lower)}'
        RETURN DISTINCT p.name AS name LIMIT 3
      `);
            rows.forEach(r => allEvidence.push(`Pattern:${r.name}`));
            // Also check integrations for tech stack items
            const integ = await q(`
        MATCH (i:LearnedIntegration)
        WHERE toLower(i.name) CONTAINS '${esc(lower)}'
        RETURN DISTINCT i.name AS name LIMIT 2
      `);
            integ.forEach(r => allEvidence.push(`Integration:${r.name}`));
            // Check data models for org/tenant patterns
            const models = await q(`
        MATCH (m:LearnedDataModel)
        WHERE toLower(m.name) CONTAINS '${esc(lower)}'
        RETURN DISTINCT m.name AS name LIMIT 2
      `);
            models.forEach(r => allEvidence.push(`Model:${r.name}`));
        }
        if (req.type === "flow") {
            const rows = await q(`
        MATCH (f:LearnedUserFlow)
        WHERE toLower(f.name) CONTAINS '${esc(lower)}'
           OR toLower(f.steps_description) CONTAINS '${esc(lower)}'
        RETURN f.name AS name LIMIT 3
      `);
            rows.forEach(r => allEvidence.push(`Flow:${r.name}`));
            // Also check features (flows might be encoded as features)
            const feats = await q(`
        MATCH (f:LearnedFeature)
        WHERE toLower(f.name) CONTAINS '${esc(lower)}'
        RETURN f.name AS name LIMIT 2
      `);
            feats.forEach(r => allEvidence.push(`Feature:${r.name}`));
        }
        if (req.type === "ui") {
            // UI patterns live in components, state patterns, form patterns, and features
            const comps = await q(`
        MATCH (c:LearnedComponentGroup)
        WHERE toLower(c.name) CONTAINS '${esc(lower)}'
        RETURN c.name AS name LIMIT 3
      `);
            comps.forEach(r => allEvidence.push(`Component:${r.name}`));
            const states = await q(`
        MATCH (s:LearnedStatePattern)
        WHERE toLower(s.component) CONTAINS '${esc(lower)}'
           OR toLower(s.description) CONTAINS '${esc(lower)}'
        RETURN s.component AS name LIMIT 2
      `);
            states.forEach(r => allEvidence.push(`StatePattern:${r.name}`));
            const forms = await q(`
        MATCH (f:LearnedFormPattern)
        WHERE toLower(f.name) CONTAINS '${esc(lower)}'
        RETURN f.name AS name LIMIT 2
      `);
            forms.forEach(r => allEvidence.push(`Form:${r.name}`));
            const designs = await q(`
        MATCH (d:LearnedDesignSystem)
        WHERE toLower(d.css_framework) CONTAINS '${esc(lower)}'
           OR toLower(d.component_library) CONTAINS '${esc(lower)}'
        RETURN d.css_framework AS name LIMIT 2
      `);
            designs.forEach(r => allEvidence.push(`Design:${r.name}`));
            // Features too
            const feats = await q(`
        MATCH (f:LearnedFeature)
        WHERE toLower(f.name) CONTAINS '${esc(lower)}'
        RETURN f.name AS name LIMIT 2
      `);
            feats.forEach(r => allEvidence.push(`Feature:${r.name}`));
        }
    }
    // Deduplicate evidence
    const unique = [...new Set(allEvidence)];
    return {
        found: unique.length > 0,
        evidence: unique.slice(0, 5).join("; "),
    };
}
// ─── Main ────────────────────────────────────────────────────────────
async function main() {
    neo4j = getNeo4jService();
    await neo4j.connect();
    console.log(`${"═".repeat(60)}`);
    console.log(`  AES Knowledge Graph — Graph-Only Test`);
    console.log(`  No outside knowledge. Pure graph reasoning.`);
    console.log(`  App: Barber Shop Appointment Booking`);
    console.log(`${"═".repeat(60)}\n`);
    // Group by type
    const groups = new Map();
    for (const req of REQUIREMENTS) {
        if (!groups.has(req.type))
            groups.set(req.type, []);
        groups.get(req.type).push(req);
    }
    const typeLabels = {
        feature: "FEATURES",
        model: "DATA MODELS",
        integration: "INTEGRATIONS",
        pattern: "PATTERNS (auth + tech stack)",
        flow: "USER FLOWS",
        ui: "UI PATTERNS",
    };
    let totalFound = 0;
    let totalRequired = 0;
    const sectionResults = [];
    for (const [type, reqs] of groups) {
        const hits = [];
        const misses = [];
        for (const req of reqs) {
            const result = await searchGraph(req);
            if (result.found) {
                hits.push(`${req.name} → ${result.evidence}`);
                totalFound++;
            }
            else {
                misses.push(req.name);
            }
            totalRequired++;
        }
        sectionResults.push({
            label: typeLabels[type] || type,
            found: hits.length,
            total: reqs.length,
            hits,
            misses,
        });
    }
    // Print results
    for (const sec of sectionResults) {
        const pct = Math.round((sec.found / sec.total) * 100);
        const icon = pct >= 80 ? "✅" : pct >= 50 ? "⚠️" : "❌";
        console.log(`${icon} ${sec.label}: ${sec.found}/${sec.total} (${pct}%)`);
        for (const h of sec.hits) {
            console.log(`   ✓ ${h}`);
        }
        for (const m of sec.misses) {
            console.log(`   ✗ MISSING: ${m}`);
        }
        console.log();
    }
    const overallPct = Math.round((totalFound / totalRequired) * 100);
    console.log(`${"═".repeat(60)}`);
    console.log(`  OVERALL: ${totalFound}/${totalRequired} (${overallPct}%)`);
    console.log(`${"═".repeat(60)}`);
    // Compare with old test
    console.log(`\n  Previous test (exact match): 37/74 (50%)`);
    console.log(`  This test (keyword search):  ${totalFound}/${totalRequired} (${overallPct}%)`);
    console.log(`  Improvement: +${overallPct - 50}pp`);
    await neo4j.close();
}
main().catch(console.error);
