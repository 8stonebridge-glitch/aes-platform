// ============================================================
// AES Graph — Seed Nodes
// ============================================================

// --- Repos (5) ---
CREATE (r1:Repo {repo_id: 'repo-aes-packages', name: 'aes-packages', url: 'https://github.com/aes-platform/aes-packages', description: 'Shared packages for AES builds', default_branch: 'main'});
CREATE (r2:Repo {repo_id: 'repo-aes-templates', name: 'aes-templates', url: 'https://github.com/aes-platform/aes-templates', description: 'App and feature templates', default_branch: 'main'});
CREATE (r3:Repo {repo_id: 'repo-aes-catalog', name: 'aes-catalog', url: 'https://github.com/aes-platform/aes-catalog', description: 'Reuse catalog entries', default_branch: 'main'});
CREATE (r4:Repo {repo_id: 'repo-aes-rules', name: 'aes-rules', url: 'https://github.com/aes-platform/aes-rules', description: 'Validation rules and gate definitions', default_branch: 'main'});
CREATE (r5:Repo {repo_id: 'repo-aes-platform', name: 'aes-platform', url: 'https://github.com/aes-platform/aes-platform', description: 'Core AES runtime and operator surface', default_branch: 'main'});

// --- Team (1) ---
CREATE (t1:Team {team_id: 'team-aes-core', name: 'aes-core', description: 'Core AES platform team'});

// --- FeatureTypes (6) ---
CREATE (ft1:FeatureType {type_id: 'workflow', name: 'Workflow', description: 'Task and process management workflows including kanban, state machines, and approval flows'});
CREATE (ft2:FeatureType {type_id: 'notification_system', name: 'Notification System', description: 'Real-time notification delivery, triage, and preference management'});
CREATE (ft3:FeatureType {type_id: 'payments_and_billing_verification', name: 'Payments & Billing Verification', description: 'Payment processing, billing cycles, dunning, and revenue verification'});
CREATE (ft4:FeatureType {type_id: 'collaboration_system', name: 'Collaboration System', description: 'Multi-user collaboration including messaging, presence, and shared state'});
CREATE (ft5:FeatureType {type_id: 'onboarding', name: 'Onboarding', description: 'User and organization onboarding flows including activation, setup wizards, and provisioning'});
CREATE (ft6:FeatureType {type_id: 'backend_platform', name: 'Backend Platform', description: 'Core backend infrastructure including auth, data layer, API routing, and background jobs'});

// --- ValidatorBundles (6) ---
CREATE (vb1:ValidatorBundle {bundle_id: 'vb-workflow', name: 'Workflow Validators', feature_type: 'workflow', description: 'State machine integrity, transition coverage, and permission gate checks', validators: '["state-transition-coverage","permission-gate-check","dead-state-detection"]'});
CREATE (vb2:ValidatorBundle {bundle_id: 'vb-notification', name: 'Notification Validators', feature_type: 'notification_system', description: 'Delivery verification, preference enforcement, and rate limit checks', validators: '["delivery-verification","preference-enforcement","rate-limit-check"]'});
CREATE (vb3:ValidatorBundle {bundle_id: 'vb-payments', name: 'Payments Validators', feature_type: 'payments_and_billing_verification', description: 'Idempotency, webhook signature, and billing cycle integrity checks', validators: '["idempotency-check","webhook-signature-verify","billing-cycle-integrity"]'});
CREATE (vb4:ValidatorBundle {bundle_id: 'vb-collaboration', name: 'Collaboration Validators', feature_type: 'collaboration_system', description: 'Presence consistency, message ordering, and conflict resolution checks', validators: '["presence-consistency","message-ordering","conflict-resolution"]'});
CREATE (vb5:ValidatorBundle {bundle_id: 'vb-onboarding', name: 'Onboarding Validators', feature_type: 'onboarding', description: 'Step completion, activation gate, and data provisioning checks', validators: '["step-completion-check","activation-gate","data-provisioning-verify"]'});
CREATE (vb6:ValidatorBundle {bundle_id: 'vb-backend', name: 'Backend Platform Validators', feature_type: 'backend_platform', description: 'Auth flow integrity, schema migration, and API contract checks', validators: '["auth-flow-integrity","schema-migration-check","api-contract-verify"]'});

// --- BridgePresets (6) ---
CREATE (bp1:BridgePreset {preset_id: 'bp-workflow', name: 'Workflow Bridge', feature_type: 'workflow', description: 'Compiles workflow features using kanban/state-machine patterns from catalog'});
CREATE (bp2:BridgePreset {preset_id: 'bp-notification', name: 'Notification Bridge', feature_type: 'notification_system', description: 'Compiles notification features using delivery/triage patterns from catalog'});
CREATE (bp3:BridgePreset {preset_id: 'bp-payments', name: 'Payments Bridge', feature_type: 'payments_and_billing_verification', description: 'Compiles payment features using billing/dunning patterns from catalog'});
CREATE (bp4:BridgePreset {preset_id: 'bp-collaboration', name: 'Collaboration Bridge', feature_type: 'collaboration_system', description: 'Compiles collaboration features using messaging/presence patterns from catalog'});
CREATE (bp5:BridgePreset {preset_id: 'bp-onboarding', name: 'Onboarding Bridge', feature_type: 'onboarding', description: 'Compiles onboarding features using wizard/activation patterns from catalog'});
CREATE (bp6:BridgePreset {preset_id: 'bp-backend', name: 'Backend Platform Bridge', feature_type: 'backend_platform', description: 'Compiles backend features using auth/data-layer patterns from catalog'});

// --- ScenarioPacks (6) ---
CREATE (sp1:ScenarioPack {pack_id: 'sp-workflow', name: 'Workflow Scenarios', feature_type: 'workflow', description: 'Test scenarios for workflow features', scenarios: '["happy-path-create-task","transition-all-states","permission-denied-flow","bulk-update","concurrent-edit"]'});
CREATE (sp2:ScenarioPack {pack_id: 'sp-notification', name: 'Notification Scenarios', feature_type: 'notification_system', description: 'Test scenarios for notification features', scenarios: '["send-receive-basic","preference-opt-out","rate-limit-exceeded","batch-delivery","channel-fallback"]'});
CREATE (sp3:ScenarioPack {pack_id: 'sp-payments', name: 'Payments Scenarios', feature_type: 'payments_and_billing_verification', description: 'Test scenarios for payment features', scenarios: '["successful-charge","declined-card","webhook-retry","subscription-upgrade","dunning-recovery"]'});
CREATE (sp4:ScenarioPack {pack_id: 'sp-collaboration', name: 'Collaboration Scenarios', feature_type: 'collaboration_system', description: 'Test scenarios for collaboration features', scenarios: '["send-message","presence-update","thread-reply","file-share","mention-notification"]'});
CREATE (sp5:ScenarioPack {pack_id: 'sp-onboarding', name: 'Onboarding Scenarios', feature_type: 'onboarding', description: 'Test scenarios for onboarding features', scenarios: '["complete-wizard","skip-optional-step","invite-team-member","activate-org","resume-incomplete"]'});
CREATE (sp6:ScenarioPack {pack_id: 'sp-backend', name: 'Backend Platform Scenarios', feature_type: 'backend_platform', description: 'Test scenarios for backend features', scenarios: '["auth-login-logout","schema-migrate-up","api-crud-cycle","background-job-run","rate-limit-enforce"]'});

// --- Packages (27) ---
CREATE (p1:Package {package_id: 'pkg-ui-shell', name: '@aes/ui-shell', repo: 'aes-packages', package_path: 'packages/ui-shell', description: 'App shell with sidebar, topbar, and content area', promotion_tier: 'CANONICAL'});
CREATE (p2:Package {package_id: 'pkg-ui-data-table', name: '@aes/ui-data-table', repo: 'aes-packages', package_path: 'packages/ui-data-table', description: 'Sortable, filterable data table component', promotion_tier: 'CANONICAL'});
CREATE (p3:Package {package_id: 'pkg-ui-kanban', name: '@aes/ui-kanban', repo: 'aes-packages', package_path: 'packages/ui-kanban', description: 'Drag-and-drop kanban board component', promotion_tier: 'VERIFIED'});
CREATE (p4:Package {package_id: 'pkg-ui-detail-panel', name: '@aes/ui-detail-panel', repo: 'aes-packages', package_path: 'packages/ui-detail-panel', description: 'Slide-over detail panel for entity views', promotion_tier: 'VERIFIED'});
CREATE (p5:Package {package_id: 'pkg-ui-form-kit', name: '@aes/ui-form-kit', repo: 'aes-packages', package_path: 'packages/ui-form-kit', description: 'Form components with validation and submission handling', promotion_tier: 'CANONICAL'});
CREATE (p6:Package {package_id: 'pkg-ui-notification-feed', name: '@aes/ui-notification-feed', repo: 'aes-packages', package_path: 'packages/ui-notification-feed', description: 'Notification feed with triage actions', promotion_tier: 'VERIFIED'});
CREATE (p7:Package {package_id: 'pkg-ui-toast', name: '@aes/ui-toast', repo: 'aes-packages', package_path: 'packages/ui-toast', description: 'Toast notification system', promotion_tier: 'CANONICAL'});
CREATE (p8:Package {package_id: 'pkg-ui-empty-state', name: '@aes/ui-empty-state', repo: 'aes-packages', package_path: 'packages/ui-empty-state', description: 'Empty state illustrations and CTAs', promotion_tier: 'CANONICAL'});
CREATE (p9:Package {package_id: 'pkg-ui-status-badge', name: '@aes/ui-status-badge', repo: 'aes-packages', package_path: 'packages/ui-status-badge', description: 'Color-coded status badges', promotion_tier: 'CANONICAL'});
CREATE (p10:Package {package_id: 'pkg-auth-clerk', name: '@aes/auth-clerk', repo: 'aes-packages', package_path: 'packages/auth-clerk', description: 'Clerk authentication integration', promotion_tier: 'CANONICAL'});
CREATE (p11:Package {package_id: 'pkg-auth-middleware', name: '@aes/auth-middleware', repo: 'aes-packages', package_path: 'packages/auth-middleware', description: 'Server-side auth middleware for Convex', promotion_tier: 'CANONICAL'});
CREATE (p12:Package {package_id: 'pkg-convex-helpers', name: '@aes/convex-helpers', repo: 'aes-packages', package_path: 'packages/convex-helpers', description: 'Convex query and mutation helpers', promotion_tier: 'CANONICAL'});
CREATE (p13:Package {package_id: 'pkg-convex-schema-gen', name: '@aes/convex-schema-gen', repo: 'aes-packages', package_path: 'packages/convex-schema-gen', description: 'Schema generation from reference schemas', promotion_tier: 'VERIFIED'});
CREATE (p14:Package {package_id: 'pkg-workflow-engine', name: '@aes/workflow-engine', repo: 'aes-packages', package_path: 'packages/workflow-engine', description: 'State machine engine for workflow features', promotion_tier: 'VERIFIED'});
CREATE (p15:Package {package_id: 'pkg-notification-engine', name: '@aes/notification-engine', repo: 'aes-packages', package_path: 'packages/notification-engine', description: 'Multi-channel notification delivery engine', promotion_tier: 'VERIFIED'});
CREATE (p16:Package {package_id: 'pkg-billing-engine', name: '@aes/billing-engine', repo: 'aes-packages', package_path: 'packages/billing-engine', description: 'Stripe billing integration with dunning', promotion_tier: 'VERIFIED'});
CREATE (p17:Package {package_id: 'pkg-collaboration-engine', name: '@aes/collaboration-engine', repo: 'aes-packages', package_path: 'packages/collaboration-engine', description: 'Real-time collaboration engine', promotion_tier: 'DERIVED'});
CREATE (p18:Package {package_id: 'pkg-onboarding-engine', name: '@aes/onboarding-engine', repo: 'aes-packages', package_path: 'packages/onboarding-engine', description: 'Multi-step onboarding wizard engine', promotion_tier: 'VERIFIED'});
CREATE (p19:Package {package_id: 'pkg-ui-sidebar', name: '@aes/ui-sidebar', repo: 'aes-packages', package_path: 'packages/ui-sidebar', description: 'Collapsible sidebar navigation', promotion_tier: 'CANONICAL'});
CREATE (p20:Package {package_id: 'pkg-ui-command-palette', name: '@aes/ui-command-palette', repo: 'aes-packages', package_path: 'packages/ui-command-palette', description: 'Command palette for keyboard-driven navigation', promotion_tier: 'VERIFIED'});
CREATE (p21:Package {package_id: 'pkg-ui-avatar', name: '@aes/ui-avatar', repo: 'aes-packages', package_path: 'packages/ui-avatar', description: 'User avatar with presence indicator', promotion_tier: 'CANONICAL'});
CREATE (p22:Package {package_id: 'pkg-ui-dropdown', name: '@aes/ui-dropdown', repo: 'aes-packages', package_path: 'packages/ui-dropdown', description: 'Dropdown menu component', promotion_tier: 'CANONICAL'});
CREATE (p23:Package {package_id: 'pkg-ui-modal', name: '@aes/ui-modal', repo: 'aes-packages', package_path: 'packages/ui-modal', description: 'Modal dialog component', promotion_tier: 'CANONICAL'});
CREATE (p24:Package {package_id: 'pkg-ui-tabs', name: '@aes/ui-tabs', repo: 'aes-packages', package_path: 'packages/ui-tabs', description: 'Tab navigation component', promotion_tier: 'CANONICAL'});
CREATE (p25:Package {package_id: 'pkg-api-router', name: '@aes/api-router', repo: 'aes-packages', package_path: 'packages/api-router', description: 'API routing and middleware framework', promotion_tier: 'CANONICAL'});
CREATE (p26:Package {package_id: 'pkg-background-jobs', name: '@aes/background-jobs', repo: 'aes-packages', package_path: 'packages/background-jobs', description: 'Background job scheduling and execution', promotion_tier: 'VERIFIED'});
CREATE (p27:Package {package_id: 'pkg-ui-loading', name: '@aes/ui-loading', repo: 'aes-packages', package_path: 'packages/ui-loading', description: 'Loading spinners and skeleton screens', promotion_tier: 'CANONICAL'});

// --- Patterns (6) ---
CREATE (pat1:Pattern {pattern_id: 'pat-linear-work-item', name: 'Linear Work Item Detail', type: 'workflow', description: 'Work item detail panel inspired by Linear issue view', source_donor: 'linear', promotion_tier: 'VERIFIED'});
CREATE (pat2:Pattern {pattern_id: 'pat-github-notification', name: 'GitHub Notification Triage', type: 'notification_system', description: 'Notification inbox with triage actions inspired by GitHub', source_donor: 'github', promotion_tier: 'VERIFIED'});
CREATE (pat3:Pattern {pattern_id: 'pat-stripe-recovery', name: 'Stripe Recovery Console', type: 'payments_and_billing_verification', description: 'Failed payment recovery flow inspired by Stripe dashboard', source_donor: 'stripe', promotion_tier: 'VERIFIED'});
CREATE (pat4:Pattern {pattern_id: 'pat-slack-collab', name: 'Slack Collaboration Shell', type: 'collaboration_system', description: 'Channel-based messaging shell inspired by Slack', source_donor: 'slack', promotion_tier: 'DERIVED'});
CREATE (pat5:Pattern {pattern_id: 'pat-clerk-activation', name: 'Clerk Org Activation', type: 'onboarding', description: 'Organization activation flow inspired by Clerk onboarding', source_donor: 'clerk', promotion_tier: 'VERIFIED'});
CREATE (pat6:Pattern {pattern_id: 'pat-stripe-operator', name: 'Stripe Operator Shell', type: 'backend_platform', description: 'Backend operator dashboard inspired by Stripe admin console', source_donor: 'stripe', promotion_tier: 'VERIFIED'});

// --- CatalogEntries (6 matching patterns) ---
CREATE (ce1:CatalogEntry {entry_id: 'ce-linear-work-item', name: 'Linear Work Item Detail', type: 'component', repo: 'aes-catalog', package_path: 'catalog/workflow/linear-work-item', promotion_tier: 'VERIFIED', description: 'Reusable work item detail panel'});
CREATE (ce2:CatalogEntry {entry_id: 'ce-github-notification', name: 'GitHub Notification Triage', type: 'component', repo: 'aes-catalog', package_path: 'catalog/notification/github-triage', promotion_tier: 'VERIFIED', description: 'Notification triage inbox component'});
CREATE (ce3:CatalogEntry {entry_id: 'ce-stripe-recovery', name: 'Stripe Recovery Console', type: 'workflow', repo: 'aes-catalog', package_path: 'catalog/payments/stripe-recovery', promotion_tier: 'VERIFIED', description: 'Payment recovery flow template'});
CREATE (ce4:CatalogEntry {entry_id: 'ce-slack-collab', name: 'Slack Collaboration Shell', type: 'component', repo: 'aes-catalog', package_path: 'catalog/collaboration/slack-shell', promotion_tier: 'DERIVED', description: 'Channel-based messaging shell'});
CREATE (ce5:CatalogEntry {entry_id: 'ce-clerk-activation', name: 'Clerk Org Activation', type: 'workflow', repo: 'aes-catalog', package_path: 'catalog/onboarding/clerk-activation', promotion_tier: 'VERIFIED', description: 'Org activation onboarding flow'});
CREATE (ce6:CatalogEntry {entry_id: 'ce-stripe-operator', name: 'Stripe Operator Shell', type: 'component', repo: 'aes-catalog', package_path: 'catalog/backend/stripe-operator', promotion_tier: 'VERIFIED', description: 'Backend operator dashboard shell'});
