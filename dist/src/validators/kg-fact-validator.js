/**
 * KG Fact Validator — Validates builder output claims against the knowledge graph.
 *
 * From the KG+LLM research paper: extract factual triples from builder output,
 * cross-reference each one against the graph, flag anything contradicted or unverifiable.
 *
 * Plugs into the build-verifier pipeline as a post-build check.
 *
 * How it works:
 *   1. Extract claims from builder output (feature names, model names, integrations,
 *      patterns, flows, auth methods, data relationships)
 *   2. For each claim, query the knowledge graph for supporting evidence
 *   3. Score each claim as VERIFIED / UNVERIFIED / CONTRADICTED
 *   4. Return a verdict with per-claim evidence trails
 *
 * Usage standalone:
 *   npx tsx src/validators/kg-fact-validator.ts
 *
 * Usage in pipeline:
 *   import { validateFacts } from "./kg-fact-validator.js";
 *   const result = await validateFacts(claims, neo4jService);
 */
// ═══════════════════════════════════════════════════════════════════════
// CLAIM EXTRACTION
// ═══════════════════════════════════════════════════════════════════════
/**
 * Extract factual claims from builder output.
 * This works on the structured AppSpec / FeatureSpec / BuilderPackage output.
 */
export function extractClaims(builderOutput) {
    const claims = [];
    // Extract feature claims
    for (const f of builderOutput.features || []) {
        claims.push({
            claim: `Feature "${f.name}" exists in domain`,
            subject: f.name, predicate: "IS_FEATURE", object: "domain",
            source: "features", category: "feature",
        });
        for (const model of f.data_models || []) {
            claims.push({
                claim: `Feature "${f.name}" uses data model "${model}"`,
                subject: f.name, predicate: "USES_MODEL", object: model,
                source: "features", category: "data",
            });
        }
        for (const integ of f.integrations || []) {
            claims.push({
                claim: `Feature "${f.name}" requires integration "${integ}"`,
                subject: f.name, predicate: "REQUIRES_INTEGRATION", object: integ,
                source: "features", category: "integration",
            });
        }
        for (const pat of f.patterns || []) {
            claims.push({
                claim: `Feature "${f.name}" uses pattern "${pat}"`,
                subject: f.name, predicate: "USES_PATTERN", object: pat,
                source: "features", category: "pattern",
            });
        }
    }
    // Extract model claims
    for (const m of builderOutput.models || []) {
        claims.push({
            claim: `Data model "${m.name}" exists`,
            subject: m.name, predicate: "IS_MODEL", object: m.category || "general",
            source: "models", category: "model",
        });
        for (const field of m.fields || []) {
            claims.push({
                claim: `Model "${m.name}" has field "${field}"`,
                subject: m.name, predicate: "HAS_FIELD", object: field,
                source: "models", category: "model",
            });
        }
        for (const rel of m.relationships || []) {
            claims.push({
                claim: `Model "${m.name}" relates to "${rel}"`,
                subject: m.name, predicate: "RELATES_TO", object: rel,
                source: "models", category: "data",
            });
        }
    }
    // Extract integration claims
    for (const i of builderOutput.integrations || []) {
        claims.push({
            claim: `Integration "${i.name}" of type "${i.type || "unknown"}"`,
            subject: i.name, predicate: "IS_INTEGRATION", object: i.type || "unknown",
            source: "integrations", category: "integration",
        });
        if (i.auth_method) {
            claims.push({
                claim: `Integration "${i.name}" uses auth method "${i.auth_method}"`,
                subject: i.name, predicate: "AUTH_METHOD", object: i.auth_method,
                source: "integrations", category: "auth",
            });
        }
    }
    // Extract pattern claims
    for (const p of builderOutput.patterns || []) {
        claims.push({
            claim: `Pattern "${p.name}" of type "${p.type || "unknown"}"`,
            subject: p.name, predicate: "IS_PATTERN", object: p.type || "unknown",
            source: "patterns", category: "pattern",
        });
    }
    // Extract flow claims
    for (const f of builderOutput.flows || []) {
        claims.push({
            claim: `User flow "${f.name}" exists`,
            subject: f.name, predicate: "IS_FLOW", object: "user_flow",
            source: "flows", category: "flow",
        });
    }
    // Extract auth claims
    if (builderOutput.auth) {
        if (builderOutput.auth.method) {
            claims.push({
                claim: `Auth method is "${builderOutput.auth.method}"`,
                subject: "auth", predicate: "METHOD", object: builderOutput.auth.method,
                source: "auth", category: "auth",
            });
        }
        if (builderOutput.auth.provider) {
            claims.push({
                claim: `Auth provider is "${builderOutput.auth.provider}"`,
                subject: "auth", predicate: "PROVIDER", object: builderOutput.auth.provider,
                source: "auth", category: "auth",
            });
        }
        for (const role of builderOutput.auth.roles || []) {
            claims.push({
                claim: `Role "${role}" exists in auth model`,
                subject: role, predicate: "IS_ROLE", object: "auth",
                source: "auth", category: "auth",
            });
        }
    }
    return claims;
}
/**
 * Extract claims from raw text (code comments, spec prose, etc.)
 * Uses pattern matching to find factual assertions.
 */
export function extractClaimsFromText(text, source) {
    const claims = [];
    const lower = text.toLowerCase();
    // Pattern: "uses <integration>"
    const integPatterns = [
        /uses?\s+(stripe|twilio|sendgrid|redis|postgres|prisma|drizzle|nextauth|clerk|auth0|resend|nodemailer|postmark|aws|s3|ses)/gi,
        /integrat(?:es?|ion)\s+(?:with\s+)?(stripe|twilio|sendgrid|redis|postgres|prisma|drizzle|nextauth|clerk|auth0|resend|nodemailer)/gi,
    ];
    for (const pat of integPatterns) {
        let match;
        while ((match = pat.exec(text)) !== null) {
            claims.push({
                claim: `Uses integration "${match[1]}"`,
                subject: match[1], predicate: "IS_INTEGRATION", object: "claimed",
                source, category: "integration",
            });
        }
    }
    // Pattern: "RBAC", "role-based", "JWT", "OAuth"
    const authPatterns = [
        { regex: /\brbac\b/i, claim: "Uses RBAC", subject: "auth", object: "rbac" },
        { regex: /\brole.based\s+access/i, claim: "Uses role-based access control", subject: "auth", object: "rbac" },
        { regex: /\bjwt\b/i, claim: "Uses JWT authentication", subject: "auth", object: "jwt" },
        { regex: /\boauth\b/i, claim: "Uses OAuth", subject: "auth", object: "oauth" },
        { regex: /\bsso\b/i, claim: "Uses SSO", subject: "auth", object: "sso" },
    ];
    for (const { regex, claim, subject, object } of authPatterns) {
        if (regex.test(text)) {
            claims.push({ claim, subject, predicate: "AUTH_METHOD", object, source, category: "auth" });
        }
    }
    // Pattern: data model names (PascalCase words that look like models)
    const modelPattern = /(?:model|schema|table|entity)\s+(\w+)/gi;
    let modelMatch;
    while ((modelMatch = modelPattern.exec(text)) !== null) {
        claims.push({
            claim: `Data model "${modelMatch[1]}" referenced`,
            subject: modelMatch[1], predicate: "IS_MODEL", object: "referenced",
            source, category: "model",
        });
    }
    return claims;
}
// ═══════════════════════════════════════════════════════════════════════
// GRAPH VERIFICATION
// ═══════════════════════════════════════════════════════════════════════
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
async function q(neo4j, cypher) {
    try {
        return await neo4j.runCypher(cypher);
    }
    catch {
        return [];
    }
}
/**
 * Verify a single claim against the knowledge graph.
 * Returns evidence paths and a confidence score.
 */
async function verifyClaim(neo4j, claim) {
    const evidence = [];
    let graphHits = 0;
    const subjectLower = claim.subject.toLowerCase();
    const objectLower = claim.object.toLowerCase();
    switch (claim.category) {
        case "feature": {
            // Check if this feature exists in any learned app
            const hits = await q(neo4j, `
        MATCH (f:LearnedFeature)
        WHERE toLower(f.name) CONTAINS '${esc(subjectLower)}'
        RETURN f.name AS name, f.complexity AS complexity LIMIT 5
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`Feature:${r.name} [${r.complexity || "unknown"}]`));
            // Also check with synonyms
            if (graphHits === 0) {
                const synonymHits = await q(neo4j, `
          MATCH (f:LearnedFeature)
          WHERE toLower(f.description) CONTAINS '${esc(subjectLower)}'
          RETURN f.name AS name LIMIT 3
        `);
                graphHits += synonymHits.length;
                synonymHits.forEach((r) => evidence.push(`Feature:${r.name} (via description)`));
            }
            break;
        }
        case "model": {
            if (claim.predicate === "IS_MODEL") {
                const hits = await q(neo4j, `
          MATCH (m:LearnedDataModel)
          WHERE toLower(m.name) CONTAINS '${esc(subjectLower)}'
          RETURN m.name AS name, m.category AS category, m.field_count AS fc LIMIT 5
        `);
                graphHits = hits.length;
                hits.forEach((r) => evidence.push(`Model:${r.name} [${r.category}] ${r.fc || 0} fields`));
            }
            else if (claim.predicate === "HAS_FIELD") {
                // Check if the model exists and if its fields contain the claimed field
                const hits = await q(neo4j, `
          MATCH (m:LearnedDataModel)
          WHERE toLower(m.name) CONTAINS '${esc(subjectLower)}'
            AND toLower(m.fields_csv) CONTAINS '${esc(objectLower)}'
          RETURN m.name AS name, m.fields_csv AS fields LIMIT 3
        `);
                graphHits = hits.length;
                hits.forEach((r) => evidence.push(`Model:${r.name} fields include "${claim.object}"`));
                // If no hit on fields_csv, check if model at least exists
                if (graphHits === 0) {
                    const modelExists = await q(neo4j, `
            MATCH (m:LearnedDataModel)
            WHERE toLower(m.name) CONTAINS '${esc(subjectLower)}'
            RETURN m.name AS name LIMIT 1
          `);
                    if (modelExists.length > 0) {
                        evidence.push(`Model:${modelExists[0].name} exists but field "${claim.object}" not found in fields_csv`);
                    }
                }
            }
            break;
        }
        case "integration": {
            const hits = await q(neo4j, `
        MATCH (i:LearnedIntegration)
        WHERE toLower(i.name) CONTAINS '${esc(subjectLower)}'
        RETURN i.name AS name, i.type AS type, i.provider AS provider LIMIT 5
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`Integration:${r.name} [${r.type}] provider:${r.provider || "unknown"}`));
            // Check how many apps use this integration (cross-app validation)
            if (graphHits > 0) {
                const appCount = await q(neo4j, `
          MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
          WHERE toLower(i.name) CONTAINS '${esc(subjectLower)}'
          RETURN count(DISTINCT a) AS cnt
        `);
                if (appCount.length > 0) {
                    const cnt = appCount[0].cnt?.low || appCount[0].cnt || 0;
                    evidence.push(`Used by ${cnt} app(s) in graph`);
                }
            }
            break;
        }
        case "pattern": {
            const hits = await q(neo4j, `
        MATCH (p:LearnedPattern)
        WHERE toLower(p.name) CONTAINS '${esc(subjectLower)}'
          OR toLower(p.description) CONTAINS '${esc(subjectLower)}'
        RETURN p.name AS name, p.type AS type LIMIT 5
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`Pattern:${r.name} [${r.type}]`));
            // Cross-app validation
            if (graphHits > 0) {
                const appCount = await q(neo4j, `
          MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern)
          WHERE toLower(p.name) CONTAINS '${esc(subjectLower)}'
          RETURN count(DISTINCT a) AS cnt
        `);
                if (appCount.length > 0) {
                    const cnt = appCount[0].cnt?.low || appCount[0].cnt || 0;
                    evidence.push(`Used by ${cnt} app(s) — ${cnt >= 5 ? "well-established" : cnt >= 2 ? "common" : "niche"}`);
                }
            }
            break;
        }
        case "flow": {
            const hits = await q(neo4j, `
        MATCH (f:LearnedUserFlow)
        WHERE toLower(f.name) CONTAINS '${esc(subjectLower)}'
        RETURN f.name AS name, f.step_count AS steps LIMIT 5
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`Flow:${r.name} [${r.steps || "?"} steps]`));
            break;
        }
        case "auth": {
            // Check for auth patterns in graph
            const hits = await q(neo4j, `
        MATCH (p:LearnedPattern)
        WHERE toLower(p.name) CONTAINS '${esc(objectLower)}'
          OR toLower(p.type) = 'auth'
        RETURN p.name AS name, p.type AS type LIMIT 5
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`AuthPattern:${r.name} [${r.type}]`));
            // Check integrations for auth providers
            const authInteg = await q(neo4j, `
        MATCH (i:LearnedIntegration)
        WHERE toLower(i.name) CONTAINS '${esc(objectLower)}'
          OR toLower(i.type) = 'auth'
        RETURN i.name AS name, i.type AS type LIMIT 5
      `);
            graphHits += authInteg.length;
            authInteg.forEach((r) => evidence.push(`AuthIntegration:${r.name} [${r.type}]`));
            break;
        }
        case "data": {
            // Check if a relationship between subject and object exists via apps
            const hits = await q(neo4j, `
        MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
        WHERE toLower(f.name) CONTAINS '${esc(subjectLower)}'
        WITH a
        MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
        WHERE toLower(m.name) CONTAINS '${esc(objectLower)}'
        RETURN m.name AS model, a.name AS app LIMIT 3
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`${claim.subject} → ${r.model} via ${r.app}`));
            // Also check reverse (model → feature)
            if (graphHits === 0) {
                const reverseHits = await q(neo4j, `
          MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
          WHERE toLower(m.name) CONTAINS '${esc(subjectLower)}'
          WITH a
          MATCH (a)-[:HAS_DATA_MODEL]->(m2:LearnedDataModel)
          WHERE toLower(m2.name) CONTAINS '${esc(objectLower)}'
          RETURN m2.name AS model, a.name AS app LIMIT 3
        `);
                graphHits = reverseHits.length;
                reverseHits.forEach((r) => evidence.push(`${claim.subject} co-occurs with ${r.model} in ${r.app}`));
            }
            break;
        }
        case "api": {
            // Check for API-related patterns and integrations
            const hits = await q(neo4j, `
        MATCH (p:LearnedPattern)
        WHERE toLower(p.name) CONTAINS '${esc(subjectLower)}'
          AND toLower(p.type) IN ['api', 'architecture']
        RETURN p.name AS name, p.type AS type LIMIT 3
      `);
            graphHits = hits.length;
            hits.forEach((r) => evidence.push(`APIPattern:${r.name} [${r.type}]`));
            break;
        }
    }
    // Determine status
    let status;
    let confidence;
    if (graphHits >= 3) {
        status = "VERIFIED";
        confidence = Math.min(1.0, 0.7 + graphHits * 0.05);
    }
    else if (graphHits >= 1) {
        status = "VERIFIED";
        confidence = 0.4 + graphHits * 0.15;
    }
    else {
        // Check for contradictions — does the graph explicitly have something different?
        const contradiction = await checkContradiction(neo4j, claim);
        if (contradiction) {
            status = "CONTRADICTED";
            confidence = contradiction.confidence;
            evidence.push(`CONTRADICTION: ${contradiction.reason}`);
        }
        else {
            status = "UNVERIFIED";
            confidence = 0;
            evidence.push("No matching evidence found in knowledge graph");
        }
    }
    return { claim, status, confidence, evidence, graphHits };
}
/**
 * Check if the graph actively contradicts a claim.
 * E.g., builder says "uses MongoDB" but all graph apps use PostgreSQL.
 */
async function checkContradiction(neo4j, claim) {
    const subjectLower = claim.subject.toLowerCase();
    if (claim.category === "integration" && claim.predicate === "IS_INTEGRATION") {
        // Check if this integration type exists but with a different name
        // e.g., claim says "MongoDB" but graph only has "PostgreSQL" for databases
        const typeHits = await q(neo4j, `
      MATCH (i:LearnedIntegration)
      WHERE i.type = 'database' OR i.type = 'orm' OR i.type = 'db'
      RETURN DISTINCT i.name AS name, i.type AS type LIMIT 10
    `);
        if (typeHits.length > 0 && !typeHits.some((r) => r.name.toLowerCase().includes(subjectLower))) {
            // Graph knows about databases but not this one
            const alternatives = typeHits.map((r) => r.name).join(", ");
            return {
                confidence: 0.3,
                reason: `Graph has ${typeHits.length} database integrations (${alternatives}) but not "${claim.subject}"`,
            };
        }
    }
    if (claim.category === "auth" && claim.predicate === "AUTH_METHOD") {
        // Check if graph apps use a different auth method
        const authHits = await q(neo4j, `
      MATCH (i:LearnedIntegration)
      WHERE toLower(i.type) = 'auth'
      RETURN DISTINCT i.name AS name LIMIT 10
    `);
        if (authHits.length > 0) {
            const graphAuthMethods = authHits.map((r) => r.name.toLowerCase());
            if (!graphAuthMethods.some(m => m.includes(claim.object.toLowerCase()))) {
                return {
                    confidence: 0.2, // Low confidence — auth methods are diverse
                    reason: `Graph auth integrations are [${authHits.map((r) => r.name).join(", ")}], not "${claim.object}"`,
                };
            }
        }
    }
    return null;
}
// ═══════════════════════════════════════════════════════════════════════
// MAIN VALIDATOR
// ═══════════════════════════════════════════════════════════════════════
/**
 * Validate a set of factual claims against the knowledge graph.
 * This is the main entry point for the pipeline.
 */
export async function validateFacts(claims, neo4j) {
    const verdicts = [];
    for (const claim of claims) {
        const verdict = await verifyClaim(neo4j, claim);
        verdicts.push(verdict);
    }
    const verified = verdicts.filter(v => v.status === "VERIFIED").length;
    const unverified = verdicts.filter(v => v.status === "UNVERIFIED").length;
    const contradicted = verdicts.filter(v => v.status === "CONTRADICTED").length;
    const total = claims.length;
    const score = total > 0 ? verified / total : 0;
    let overallVerdict;
    let summary;
    if (contradicted > 0) {
        overallVerdict = "FAIL";
        summary = `${contradicted} claim(s) contradicted by knowledge graph. ${verified}/${total} verified.`;
    }
    else if (score >= 0.7) {
        overallVerdict = "PASS";
        summary = `${verified}/${total} claims verified (${Math.round(score * 100)}%). ${unverified} unverified (may be novel).`;
    }
    else if (score >= 0.4) {
        overallVerdict = "PASS_WITH_CONCERNS";
        summary = `Only ${verified}/${total} claims verified (${Math.round(score * 100)}%). ${unverified} claims have no graph evidence.`;
    }
    else {
        overallVerdict = "FAIL";
        summary = `Only ${verified}/${total} claims verified (${Math.round(score * 100)}%). Builder output may be hallucinated.`;
    }
    return {
        verdict: overallVerdict,
        score,
        total_claims: total,
        verified,
        unverified,
        contradicted,
        verdicts,
        summary,
    };
}
// ═══════════════════════════════════════════════════════════════════════
// STANDALONE TEST
// ═══════════════════════════════════════════════════════════════════════
async function main() {
    const { getNeo4jService } = await import("../services/neo4j-service.js");
    const neo4j = getNeo4jService();
    await neo4j.connect();
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  AES KG Fact Validator — Testing against barber booking builder output`);
    console.log(`${"═".repeat(70)}\n`);
    // Simulate a builder output for a barber booking app
    const mockBuilderOutput = {
        features: [
            { name: "Booking", description: "Appointment scheduling", data_models: ["Booking", "Availability"], integrations: ["Stripe"], patterns: ["Real-time Communication"] },
            { name: "Authentication", description: "User login", integrations: ["NextAuth"], patterns: ["RBAC"] },
            { name: "Notifications", description: "Email reminders", integrations: ["Nodemailer", "Twilio"], patterns: ["Email Template System"] },
            { name: "Analytics", description: "Dashboard", data_models: ["AnalyticsEvent"], patterns: ["Chart.js"] },
            { name: "Payments", description: "Payment processing", integrations: ["Stripe"], patterns: ["Stripe Payment Integration"] },
        ],
        models: [
            { name: "User", fields: ["email", "name", "role", "password"], category: "auth", relationships: ["Booking", "Review"] },
            { name: "Booking", fields: ["date", "time", "status", "userId", "serviceId"], category: "scheduling" },
            { name: "Service", fields: ["name", "duration", "price"], category: "scheduling" },
            { name: "Availability", fields: ["date", "slots", "barberId"], category: "scheduling" },
        ],
        integrations: [
            { name: "Stripe", type: "payment", auth_method: "api_key" },
            { name: "NextAuth", type: "auth", auth_method: "jwt" },
            { name: "Nodemailer", type: "email" },
            { name: "Redis", type: "cache" },
            { name: "MongoDB", type: "database" }, // This might be contradicted — graph apps use PostgreSQL
        ],
        patterns: [
            { name: "Real-time Communication", type: "api" },
            { name: "RBAC", type: "auth" },
            { name: "Stripe Payment Integration", type: "payments" },
            { name: "Zod Runtime Validation", type: "validation" },
            { name: "GraphQL Federation", type: "api" }, // Might not exist in graph
        ],
        flows: [
            { name: "Authentication", steps: ["login", "register", "forgot-password"] },
            { name: "Booking Flow", steps: ["select-service", "pick-time", "confirm", "pay"] },
            { name: "User Onboarding", steps: ["signup", "profile", "preferences"] },
        ],
        auth: {
            method: "jwt",
            provider: "NextAuth",
            roles: ["admin", "barber", "client"],
        },
    };
    // Extract claims
    const claims = extractClaims(mockBuilderOutput);
    console.log(`  Extracted ${claims.length} claims from builder output\n`);
    // Validate
    const result = await validateFacts(claims, neo4j);
    // Print results
    console.log(`  ▸ VERDICT: ${result.verdict}`);
    console.log(`  ▸ SCORE: ${Math.round(result.score * 100)}%`);
    console.log(`  ▸ ${result.summary}\n`);
    console.log(`  ▸ BREAKDOWN:`);
    console.log(`    ✅ VERIFIED:     ${result.verified}`);
    console.log(`    ❓ UNVERIFIED:   ${result.unverified}`);
    console.log(`    ❌ CONTRADICTED: ${result.contradicted}`);
    // Print per-category breakdown
    const byCategory = new Map();
    for (const v of result.verdicts) {
        const cat = v.claim.category;
        if (!byCategory.has(cat))
            byCategory.set(cat, { verified: 0, unverified: 0, contradicted: 0 });
        const entry = byCategory.get(cat);
        if (v.status === "VERIFIED")
            entry.verified++;
        else if (v.status === "UNVERIFIED")
            entry.unverified++;
        else
            entry.contradicted++;
    }
    console.log(`\n  ▸ PER-CATEGORY:`);
    for (const [cat, counts] of byCategory) {
        const total = counts.verified + counts.unverified + counts.contradicted;
        const pct = Math.round((counts.verified / total) * 100);
        const icon = counts.contradicted > 0 ? "❌" : pct >= 70 ? "✅" : pct >= 40 ? "⚠️" : "🔴";
        console.log(`    ${icon} ${cat.padEnd(14)} ${counts.verified}/${total} verified (${pct}%)${counts.contradicted > 0 ? ` — ${counts.contradicted} CONTRADICTED` : ""}`);
    }
    // Print interesting verdicts
    console.log(`\n  ▸ NOTABLE VERDICTS:`);
    const notable = result.verdicts.filter(v => v.status === "CONTRADICTED" || (v.status === "VERIFIED" && v.graphHits >= 3));
    for (const v of notable.slice(0, 15)) {
        const icon = v.status === "VERIFIED" ? "✅" : v.status === "CONTRADICTED" ? "❌" : "❓";
        console.log(`    ${icon} [${v.status}] ${v.claim.claim}`);
        for (const e of v.evidence.slice(0, 3)) {
            console.log(`       ${e}`);
        }
    }
    // Print unverified claims
    const unverifiedList = result.verdicts.filter(v => v.status === "UNVERIFIED");
    if (unverifiedList.length > 0) {
        console.log(`\n  ▸ UNVERIFIED CLAIMS (${unverifiedList.length}):`);
        for (const v of unverifiedList.slice(0, 10)) {
            console.log(`    ❓ ${v.claim.claim}`);
        }
    }
    console.log(`\n${"═".repeat(70)}\n`);
    await neo4j.close();
}
main().catch(console.error);
