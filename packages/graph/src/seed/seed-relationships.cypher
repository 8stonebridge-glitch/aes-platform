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
