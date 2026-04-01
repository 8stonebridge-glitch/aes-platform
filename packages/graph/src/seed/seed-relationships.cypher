// ============================================================
// AES Graph — Seed Relationships
// ============================================================

// --- Package -[LIVES_IN]-> Repo ---
MATCH (p:Package), (r:Repo {repo_id: 'repo-aes-packages'})
WHERE p.repo = 'aes-packages'
CREATE (p)-[:LIVES_IN {path: p.package_path}]->(r);

MATCH (ce:CatalogEntry), (r:Repo {repo_id: 'repo-aes-catalog'})
WHERE ce.repo = 'aes-catalog'
CREATE (ce)-[:LIVES_IN {path: ce.package_path}]->(r);

// --- Pattern -[SOURCED_FROM]-> CatalogEntry ---
MATCH (pat:Pattern {pattern_id: 'pat-linear-work-item'}), (ce:CatalogEntry {entry_id: 'ce-linear-work-item'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

MATCH (pat:Pattern {pattern_id: 'pat-github-notification'}), (ce:CatalogEntry {entry_id: 'ce-github-notification'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

MATCH (pat:Pattern {pattern_id: 'pat-stripe-recovery'}), (ce:CatalogEntry {entry_id: 'ce-stripe-recovery'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

MATCH (pat:Pattern {pattern_id: 'pat-slack-collab'}), (ce:CatalogEntry {entry_id: 'ce-slack-collab'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

MATCH (pat:Pattern {pattern_id: 'pat-clerk-activation'}), (ce:CatalogEntry {entry_id: 'ce-clerk-activation'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

MATCH (pat:Pattern {pattern_id: 'pat-stripe-operator'}), (ce:CatalogEntry {entry_id: 'ce-stripe-operator'})
CREATE (pat)-[:SOURCED_FROM]->(ce);

// --- ValidatorBundle -[VALIDATES]-> FeatureType ---
MATCH (vb:ValidatorBundle {bundle_id: 'vb-workflow'}), (ft:FeatureType {type_id: 'workflow'})
CREATE (vb)-[:VALIDATES]->(ft);

MATCH (vb:ValidatorBundle {bundle_id: 'vb-notification'}), (ft:FeatureType {type_id: 'notification_system'})
CREATE (vb)-[:VALIDATES]->(ft);

MATCH (vb:ValidatorBundle {bundle_id: 'vb-payments'}), (ft:FeatureType {type_id: 'payments_and_billing_verification'})
CREATE (vb)-[:VALIDATES]->(ft);

MATCH (vb:ValidatorBundle {bundle_id: 'vb-collaboration'}), (ft:FeatureType {type_id: 'collaboration_system'})
CREATE (vb)-[:VALIDATES]->(ft);

MATCH (vb:ValidatorBundle {bundle_id: 'vb-onboarding'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (vb)-[:VALIDATES]->(ft);

MATCH (vb:ValidatorBundle {bundle_id: 'vb-backend'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (vb)-[:VALIDATES]->(ft);

// --- Team -[OWNS]-> Package ---
MATCH (t:Team {team_id: 'team-aes-core'}), (p:Package)
WHERE p.package_id IN [
  'pkg-ui-shell', 'pkg-ui-data-table', 'pkg-ui-kanban', 'pkg-ui-detail-panel',
  'pkg-ui-form-kit', 'pkg-ui-notification-feed', 'pkg-ui-toast', 'pkg-ui-empty-state',
  'pkg-ui-status-badge', 'pkg-auth-clerk', 'pkg-auth-middleware', 'pkg-convex-helpers',
  'pkg-convex-schema-gen', 'pkg-workflow-engine', 'pkg-notification-engine',
  'pkg-billing-engine', 'pkg-collaboration-engine', 'pkg-onboarding-engine',
  'pkg-ui-sidebar', 'pkg-ui-command-palette', 'pkg-ui-avatar', 'pkg-ui-dropdown',
  'pkg-ui-modal', 'pkg-ui-tabs', 'pkg-api-router', 'pkg-background-jobs', 'pkg-ui-loading'
]
CREATE (t)-[:OWNS]->(p);

// --- Package -[REQUIRES]-> Package (dependency relationships) ---
MATCH (a:Package {package_id: 'pkg-ui-kanban'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-detail-panel'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-notification-feed'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-notification-feed'}), (b:Package {package_id: 'pkg-ui-toast'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-data-table'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-workflow-engine'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-workflow-engine'}), (b:Package {package_id: 'pkg-auth-middleware'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-notification-engine'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-notification-engine'}), (b:Package {package_id: 'pkg-background-jobs'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-billing-engine'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-billing-engine'}), (b:Package {package_id: 'pkg-auth-middleware'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-collaboration-engine'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-collaboration-engine'}), (b:Package {package_id: 'pkg-auth-middleware'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-onboarding-engine'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-onboarding-engine'}), (b:Package {package_id: 'pkg-auth-clerk'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-auth-middleware'}), (b:Package {package_id: 'pkg-auth-clerk'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-convex-schema-gen'}), (b:Package {package_id: 'pkg-convex-helpers'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-api-router'}), (b:Package {package_id: 'pkg-auth-middleware'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-command-palette'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-form-kit'}), (b:Package {package_id: 'pkg-ui-modal'})
CREATE (a)-[:REQUIRES]->(b);

// ============================================================
// ORPHAN FIX: Connect all previously disconnected nodes
// ============================================================

// --- BridgePreset -[BRIDGES]-> FeatureType ---
MATCH (bp:BridgePreset {preset_id: 'bp-workflow'}), (ft:FeatureType {type_id: 'workflow'})
CREATE (bp)-[:BRIDGES]->(ft);

MATCH (bp:BridgePreset {preset_id: 'bp-notification'}), (ft:FeatureType {type_id: 'notification_system'})
CREATE (bp)-[:BRIDGES]->(ft);

MATCH (bp:BridgePreset {preset_id: 'bp-payments'}), (ft:FeatureType {type_id: 'payments_and_billing_verification'})
CREATE (bp)-[:BRIDGES]->(ft);

MATCH (bp:BridgePreset {preset_id: 'bp-collaboration'}), (ft:FeatureType {type_id: 'collaboration_system'})
CREATE (bp)-[:BRIDGES]->(ft);

MATCH (bp:BridgePreset {preset_id: 'bp-onboarding'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (bp)-[:BRIDGES]->(ft);

MATCH (bp:BridgePreset {preset_id: 'bp-backend'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (bp)-[:BRIDGES]->(ft);

// --- ScenarioPack -[TESTS]-> FeatureType ---
MATCH (sp:ScenarioPack {pack_id: 'sp-workflow'}), (ft:FeatureType {type_id: 'workflow'})
CREATE (sp)-[:TESTS]->(ft);

MATCH (sp:ScenarioPack {pack_id: 'sp-notification'}), (ft:FeatureType {type_id: 'notification_system'})
CREATE (sp)-[:TESTS]->(ft);

MATCH (sp:ScenarioPack {pack_id: 'sp-payments'}), (ft:FeatureType {type_id: 'payments_and_billing_verification'})
CREATE (sp)-[:TESTS]->(ft);

MATCH (sp:ScenarioPack {pack_id: 'sp-collaboration'}), (ft:FeatureType {type_id: 'collaboration_system'})
CREATE (sp)-[:TESTS]->(ft);

MATCH (sp:ScenarioPack {pack_id: 'sp-onboarding'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (sp)-[:TESTS]->(ft);

MATCH (sp:ScenarioPack {pack_id: 'sp-backend'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (sp)-[:TESTS]->(ft);

// --- Clerk LearnedIntegrations -[TEACHES]-> FeatureType (onboarding, backend) ---
MATCH (li:LearnedIntegration {name: 'Clerk Client Auth'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (li)-[:TEACHES {relevance: 'client-side auth for onboarding flows'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Clerk Client Auth'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'client auth pattern for all apps'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Clerk Server Auth'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'server auth for API routes'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Clerk Middleware v6'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'route protection middleware'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Clerk Webhook Handler'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'webhook user/org provisioning'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Clerk + Convex Provider'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'auth-data layer integration'}]->(ft);

// --- Vercel LearnedIntegrations -[TEACHES]-> FeatureType (backend) ---
MATCH (li:LearnedIntegration {name: 'Vercel Next.js Deployment'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'deployment configuration'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Vercel Environment Variables'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'env var management for deployment'}]->(ft);

MATCH (li:LearnedIntegration {name: 'Vercel + Convex Integration'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (li)-[:TEACHES {relevance: 'convex backend deployment'}]->(ft);

// --- Clerk LearnedPatterns -[DEMONSTRATES]-> FeatureType ---
MATCH (lp:LearnedPattern {name: 'Clerk Org Switcher'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'org switcher for multi-tenant onboarding'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Clerk Protected Page Wrapper'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'page-level auth guard'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Clerk User Menu'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'user menu for all apps'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Clerk Role-Based Access'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'RBAC for admin features'}]->(ft);

// --- Vercel LearnedPatterns -[DEMONSTRATES]-> FeatureType ---
MATCH (lp:LearnedPattern {name: 'Vercel Preview Deployments'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'preview deployment workflow'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Vercel Edge Middleware'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'edge middleware constraints'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Vercel Serverless Function Limits'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'serverless constraints'}]->(ft);

MATCH (lp:LearnedPattern {name: 'Vercel Build Output Config'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (lp)-[:DEMONSTRATES {relevance: 'build config pattern'}]->(ft);

// --- Clerk LearnedPatterns -[PATTERN_FOR]-> Pattern ---
MATCH (lp:LearnedPattern {name: 'Clerk Org Switcher'}), (pat:Pattern {pattern_id: 'pat-clerk-activation'})
CREATE (lp)-[:PATTERN_FOR]->(pat);

// --- PreventionRules -[PREVENTS]-> FeatureType ---
MATCH (pr:PreventionRule {rule_id: 'vfp-vercel-env-vars'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'gate_4'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'vfp-vercel-edge-compat'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'vfp-vercel-func-size'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'gate_4'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'crp-clerk-provider-missing'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'crp-clerk-provider-missing'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'crp-clerk-useauth-server'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'crp-clerk-deprecated-middleware'}), (ft:FeatureType {type_id: 'backend_platform'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

MATCH (pr:PreventionRule {rule_id: 'crp-clerk-org-destructure'}), (ft:FeatureType {type_id: 'onboarding'})
CREATE (pr)-[:PREVENTS {gate: 'validation'}]->(ft);

// --- Orphan Repos connected to existing assets ---
// r2 (aes-templates) — Pattern nodes are sourced from templates
MATCH (pat:Pattern), (r:Repo {repo_id: 'repo-aes-templates'})
WHERE pat.source_donor IS NOT NULL
CREATE (pat)-[:LIVES_IN {path: 'templates/' + pat.source_donor}]->(r);

// r4 (aes-rules) — PreventionRules live in the rules repo
MATCH (pr:PreventionRule), (r:Repo {repo_id: 'repo-aes-rules'})
CREATE (pr)-[:LIVES_IN {path: 'rules/' + pr.rule_id}]->(r);

// r5 (aes-platform) — Team owns the platform repo
MATCH (t:Team {team_id: 'team-aes-core'}), (r:Repo {repo_id: 'repo-aes-platform'})
CREATE (t)-[:OWNS]->(r);

// --- Orphan Packages — add missing REQUIRES edges ---
// pkg-ui-empty-state requires pkg-ui-shell (renders inside app shell)
MATCH (a:Package {package_id: 'pkg-ui-empty-state'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

// pkg-ui-status-badge has no hard dependency but pairs with data-table
MATCH (a:Package {package_id: 'pkg-ui-status-badge'}), (b:Package {package_id: 'pkg-ui-data-table'})
CREATE (b)-[:REQUIRES]->(a);

// pkg-ui-sidebar requires pkg-ui-shell (part of shell system)
MATCH (a:Package {package_id: 'pkg-ui-sidebar'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

// pkg-ui-avatar is used by collaboration engine
MATCH (a:Package {package_id: 'pkg-collaboration-engine'}), (b:Package {package_id: 'pkg-ui-avatar'})
CREATE (a)-[:REQUIRES]->(b);

// pkg-ui-dropdown is used by data-table for row actions
MATCH (a:Package {package_id: 'pkg-ui-data-table'}), (b:Package {package_id: 'pkg-ui-dropdown'})
CREATE (a)-[:REQUIRES]->(b);

// pkg-ui-tabs requires pkg-ui-shell
MATCH (a:Package {package_id: 'pkg-ui-tabs'}), (b:Package {package_id: 'pkg-ui-shell'})
CREATE (a)-[:REQUIRES]->(b);

// pkg-ui-loading is required by data-table and notification-feed
MATCH (a:Package {package_id: 'pkg-ui-data-table'}), (b:Package {package_id: 'pkg-ui-loading'})
CREATE (a)-[:REQUIRES]->(b);

MATCH (a:Package {package_id: 'pkg-ui-notification-feed'}), (b:Package {package_id: 'pkg-ui-loading'})
CREATE (a)-[:REQUIRES]->(b);

// --- Clerk LearnedComponentPatterns -[COMPONENT_FOR]-> Package ---
MATCH (lcp:LearnedComponentPattern {name: 'SignInPage'}), (p:Package {package_id: 'pkg-auth-clerk'})
CREATE (lcp)-[:COMPONENT_FOR]->(p);

MATCH (lcp:LearnedComponentPattern {name: 'SignUpPage'}), (p:Package {package_id: 'pkg-auth-clerk'})
CREATE (lcp)-[:COMPONENT_FOR]->(p);

MATCH (lcp:LearnedComponentPattern {name: 'OrgManagementPage'}), (p:Package {package_id: 'pkg-auth-clerk'})
CREATE (lcp)-[:COMPONENT_FOR]->(p);
