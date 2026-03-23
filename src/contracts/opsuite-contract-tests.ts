/**
 * OpSuite Contract Test Registry
 *
 * Canonical contract test definitions for the OpSuite migration
 * (Clerk+Convex+Vercel → Supabase+Prisma+Caddy).
 *
 * These are used by the AES validator-runner to verify that every API route,
 * role visibility rule, and state machine transition works correctly after
 * a build or migration.
 *
 * Total: ~50 contract tests
 *   - 22 API route tests
 *   - 15 role visibility tests
 *   - 13 task state machine tests
 */

import type { RequiredTest } from "../types/artifacts.js";

// ─── API Route Contract Tests (22) ──────────────────────────────────

export const API_ROUTE_TESTS: RequiredTest[] = [
  // Tasks
  {
    test_id: "ct-task-create",
    name: "POST /api/tasks → 201 + task shape",
    type: "contract",
    description: "Create a task with valid payload. Seeds: user, org, membership, site, team.",
    pass_condition: "Status 201. Response has id, title, status, priority, createdAt.",
  },
  {
    test_id: "ct-task-status",
    name: "PATCH /api/tasks/[id]/status → Open to In Progress",
    type: "contract",
    description: "Transition task from Open to In Progress. Seeds: task in Open status.",
    pass_condition: "Status 200. Task status is now in_progress.",
  },
  {
    test_id: "ct-task-approve",
    name: "POST /api/tasks/[id]/approve → 200",
    type: "contract",
    description: "Approve a pending task. Seeds: task in Pending Approval.",
    pass_condition: "Status 200. Task status is now open.",
  },
  {
    test_id: "ct-task-verify",
    name: "POST /api/tasks/[id]/verify → 200",
    type: "contract",
    description: "Verify a submitted task. Seeds: task in Submitted.",
    pass_condition: "Status 200. Task status is now verified. verifiedAt is set.",
  },
  {
    test_id: "ct-task-delegate",
    name: "POST /api/tasks/[id]/delegate → 200",
    type: "contract",
    description: "Delegate task to another team member. Seeds: task + 2nd membership.",
    pass_condition: "Status 200. assignedToMembershipId changed. Audit entry created.",
  },
  {
    test_id: "ct-task-note",
    name: "POST /api/tasks/[id]/note → 200",
    type: "contract",
    description: "Add a note to a task. Seeds: any task.",
    pass_condition: "Status 200. TaskAudit entry with type='note' created.",
  },
  {
    test_id: "ct-task-rework",
    name: "POST /api/tasks/[id]/rework → 200",
    type: "contract",
    description: "Request rework on a submitted task. Seeds: task in Submitted.",
    pass_condition: "Status 200. Task status is in_progress. reworkCount incremented.",
  },
  {
    test_id: "ct-task-nochange",
    name: "POST /api/tasks/[id]/no-change → 200",
    type: "contract",
    description: "Mark no change on a task. Seeds: task in In Progress.",
    pass_condition: "Status 200. lastNoChangeAt is set. Audit entry created.",
  },

  // Availability
  {
    test_id: "ct-avail-create",
    name: "POST /api/availability → 201",
    type: "contract",
    description: "Create leave request. Seeds: employee membership.",
    pass_condition: "Status 201. Record has status=pending, type, startDate, endDate.",
  },
  {
    test_id: "ct-avail-approve",
    name: "POST /api/availability/[id]/approve → 200",
    type: "contract",
    description: "Approve availability request. Seeds: pending availability record.",
    pass_condition: "Status 200. Record status=approved. approvedAt is set.",
  },
  {
    test_id: "ct-avail-reject",
    name: "POST /api/availability/[id]/reject → 200",
    type: "contract",
    description: "Reject availability request. Seeds: pending availability record.",
    pass_condition: "Status 200. Record status=rejected.",
  },

  // Handoffs
  {
    test_id: "ct-handoff-complete",
    name: "POST /api/handoffs/complete → 200",
    type: "contract",
    description: "Complete daily handoff. Seeds: employee with active tasks.",
    pass_condition: "Status 200. DailyHandoff record created with date and summary.",
  },

  // Admin People
  {
    test_id: "ct-people-create",
    name: "POST /api/admin/people → 201",
    type: "contract",
    description: "Provision a new employee. Seeds: admin membership.",
    pass_condition: "Status 201. User + Membership created. Auth account exists.",
  },
  {
    test_id: "ct-people-update",
    name: "PATCH /api/admin/people/[id] → 200",
    type: "contract",
    description: "Update provisioned employee. Seeds: provisioned employee.",
    pass_condition: "Status 200. User fields updated.",
  },
  {
    test_id: "ct-people-delete",
    name: "DELETE /api/admin/people/[id] → 200",
    type: "contract",
    description: "Remove provisioned employee (soft delete). Seeds: provisioned employee.",
    pass_condition: "Status 200. Membership status=suspended.",
  },

  // Export
  {
    test_id: "ct-export-tasks",
    name: "GET /api/admin/export?type=tasks → CSV",
    type: "contract",
    description: "Export tasks as CSV. Seeds: admin + tasks.",
    pass_condition: "Status 200. Content-Type is text/csv. Body has header row + data rows.",
  },
  {
    test_id: "ct-export-audit",
    name: "GET /api/admin/export?type=audit → CSV",
    type: "contract",
    description: "Export audit log as CSV. Seeds: admin + task audits.",
    pass_condition: "Status 200. Content-Type is text/csv. Body has header row + data rows.",
  },

  // Auth negative tests
  {
    test_id: "ct-auth-no-session",
    name: "Any endpoint without session → 401",
    type: "contract",
    description: "Call any protected endpoint with no auth cookie/token.",
    pass_condition: "Status 401. Body has error message.",
  },
  {
    test_id: "ct-auth-wrong-role",
    name: "Admin endpoint with employee session → 403",
    type: "contract",
    description: "Employee tries to access admin-only endpoint (e.g. POST /api/admin/people).",
    pass_condition: "Status 403. Body has 'not authorized' or equivalent message.",
  },
];

// ─── Role Visibility Contract Tests (15) ─────────────────────────────

export const ROLE_VISIBILITY_TESTS: RequiredTest[] = [
  // Task visibility
  {
    test_id: "rv-tasks-admin",
    name: "Admin sees all org tasks",
    type: "role_visibility",
    description: "Seed 3 tasks (assigned to different members). Admin GET /api/tasks returns all 3.",
    pass_condition: "Response contains all 3 tasks.",
  },
  {
    test_id: "rv-tasks-subadmin",
    name: "Subadmin sees only team-scoped tasks",
    type: "role_visibility",
    description: "Seed tasks in subadmin's team and outside. Subadmin sees only their team's tasks.",
    pass_condition: "Response contains only tasks where accountableLeadMembershipId or assignedToMembershipId is in subadmin's teams.",
  },
  {
    test_id: "rv-tasks-employee",
    name: "Employee sees only assigned tasks",
    type: "role_visibility",
    description: "Seed tasks assigned to this employee and to others. Employee sees only theirs.",
    pass_condition: "Response contains only tasks where assignedToMembershipId matches the employee.",
  },

  // Task create scoping
  {
    test_id: "rv-task-create-admin",
    name: "Admin can assign tasks to anyone",
    type: "role_visibility",
    description: "Admin creates task assigned to any membership in the org.",
    pass_condition: "Status 201. Task created with assignee from any team.",
  },
  {
    test_id: "rv-task-create-subadmin",
    name: "Subadmin can only assign within their teams",
    type: "role_visibility",
    description: "Subadmin tries to assign task to member outside their teams.",
    pass_condition: "Status 403 when assigning outside team. 201 when assigning within team.",
  },
  {
    test_id: "rv-task-create-employee",
    name: "Employee can only self-assign",
    type: "role_visibility",
    description: "Employee tries to assign task to another member.",
    pass_condition: "Status 403. Employee can only create tasks assigned to themselves.",
  },

  // Availability visibility
  {
    test_id: "rv-avail-admin",
    name: "Admin sees all org availability requests",
    type: "role_visibility",
    description: "Seed requests from multiple members. Admin sees all.",
    pass_condition: "Response contains all org availability records.",
  },
  {
    test_id: "rv-avail-subadmin",
    name: "Subadmin sees team availability requests",
    type: "role_visibility",
    description: "Subadmin sees only their team members' requests.",
    pass_condition: "Response contains only team-scoped records.",
  },
  {
    test_id: "rv-avail-employee",
    name: "Employee sees only own availability",
    type: "role_visibility",
    description: "Employee sees only their own requests.",
    pass_condition: "Response contains only the employee's records.",
  },

  // Approve/reject scoping
  {
    test_id: "rv-approve-subadmin-scope",
    name: "Subadmin can only approve team tasks",
    type: "role_visibility",
    description: "Subadmin tries to approve/verify task outside their team.",
    pass_condition: "Status 403 for out-of-scope task. 200 for in-scope task.",
  },
  {
    test_id: "rv-approve-employee-blocked",
    name: "Employee cannot approve or verify",
    type: "role_visibility",
    description: "Employee tries to call approve or verify endpoint.",
    pass_condition: "Status 403.",
  },

  // People CRUD scoping
  {
    test_id: "rv-people-admin-only",
    name: "Only admin can manage people",
    type: "role_visibility",
    description: "Subadmin and employee try POST /api/admin/people.",
    pass_condition: "Status 403 for both.",
  },

  // Export scoping
  {
    test_id: "rv-export-admin-only",
    name: "Only admin can export",
    type: "role_visibility",
    description: "Subadmin and employee try GET /api/admin/export.",
    pass_condition: "Status 403 for both.",
  },

  // Metrics scoping
  {
    test_id: "rv-metrics-admin",
    name: "Admin sees org-wide metrics",
    type: "role_visibility",
    description: "Admin dashboard metrics cover all tasks across all teams.",
    pass_condition: "totalTasks equals org-wide count.",
  },
  {
    test_id: "rv-metrics-subadmin",
    name: "Subadmin sees team-scoped metrics",
    type: "role_visibility",
    description: "Subadmin dashboard metrics only cover their teams' tasks.",
    pass_condition: "totalTasks equals team-scoped count (less than org-wide).",
  },
];

// ─── Role Isolation Tests (25) ───────────────────────────────────────
// These verify that each role's UI surface ONLY shows features belonging
// to that role, and NEVER leaks another role's features.

export const ROLE_ISOLATION_TESTS: RequiredTest[] = [
  // ── Admin Route Isolation ──
  {
    test_id: "ri-admin-has-overview",
    name: "Admin has /admin/overview page",
    type: "role_isolation",
    description: "Admin navigates to /admin/overview. Page renders with dashboard metrics.",
    pass_condition: "Status 200. Page contains org-wide KPI metrics.",
  },
  {
    test_id: "ri-admin-has-approvals",
    name: "Admin has /admin/approvals page",
    type: "role_isolation",
    description: "Admin navigates to /admin/approvals. Page renders with approval queue.",
    pass_condition: "Status 200. Page contains approval tabs (Pending Approval, Awaiting Review).",
  },
  {
    test_id: "ri-admin-has-people",
    name: "Admin has /admin/people page",
    type: "role_isolation",
    description: "Admin navigates to /admin/people. Page renders with employee list and invite.",
    pass_condition: "Status 200. Page contains employee table and invite button.",
  },
  {
    test_id: "ri-admin-has-reports",
    name: "Admin has /admin/reports page",
    type: "role_isolation",
    description: "Admin navigates to /admin/reports. Page renders with analytics.",
    pass_condition: "Status 200. Page contains KPI row, team performance, export button.",
  },
  {
    test_id: "ri-admin-has-sites",
    name: "Admin has /admin/sites page",
    type: "role_isolation",
    description: "Admin navigates to /admin/sites. Page renders with team/site management.",
    pass_condition: "Status 200. Page contains site list.",
  },
  {
    test_id: "ri-admin-no-my-day",
    name: "Admin does NOT have My Day page",
    type: "role_isolation",
    description: "Admin tries to navigate to /employee/my-day.",
    pass_condition: "Redirect to /admin/overview or 403. Admin never sees employee My Day.",
  },
  {
    test_id: "ri-admin-no-checkin",
    name: "Admin does NOT have Check-in/Handoff page",
    type: "role_isolation",
    description: "Admin tries to navigate to /employee/check-in.",
    pass_condition: "Redirect or 403. Admin never sees employee handoff form.",
  },

  // ── Employee Route Isolation ──
  {
    test_id: "ri-employee-has-myday",
    name: "Employee has /employee/my-day page",
    type: "role_isolation",
    description: "Employee navigates to /employee/my-day. Page renders with daily view.",
    pass_condition: "Status 200. Page contains today's tasks and handoff prompt.",
  },
  {
    test_id: "ri-employee-has-checkin",
    name: "Employee has /employee/check-in page",
    type: "role_isolation",
    description: "Employee navigates to /employee/check-in. Page renders with handoff form.",
    pass_condition: "Status 200. Page contains handoff submission form.",
  },
  {
    test_id: "ri-employee-no-approvals",
    name: "Employee does NOT have Approvals page",
    type: "role_isolation",
    description: "Employee tries to navigate to /admin/approvals.",
    pass_condition: "Redirect to /employee/my-day or 403. Employee never sees approval queue.",
  },
  {
    test_id: "ri-employee-no-people",
    name: "Employee does NOT have People page",
    type: "role_isolation",
    description: "Employee tries to navigate to /admin/people.",
    pass_condition: "Redirect or 403. Employee never sees employee management.",
  },
  {
    test_id: "ri-employee-no-reports",
    name: "Employee does NOT have Reports page",
    type: "role_isolation",
    description: "Employee tries to navigate to /admin/reports.",
    pass_condition: "Redirect or 403. Employee never sees analytics dashboard.",
  },
  {
    test_id: "ri-employee-no-sites",
    name: "Employee does NOT have Sites/Teams page",
    type: "role_isolation",
    description: "Employee tries to navigate to /admin/sites.",
    pass_condition: "Redirect or 403. Employee never sees site management.",
  },
  {
    test_id: "ri-employee-no-task-create",
    name: "Employee does NOT have /admin/tasks/new page",
    type: "role_isolation",
    description: "Employee tries to navigate to /admin/tasks/new.",
    pass_condition: "Redirect or 403. Employee cannot access admin task creation.",
  },

  // ── Subadmin Route Isolation ──
  {
    test_id: "ri-subadmin-has-overview",
    name: "Subadmin has /subadmin/overview page",
    type: "role_isolation",
    description: "Subadmin navigates to /subadmin/overview. Page renders with team-scoped dashboard.",
    pass_condition: "Status 200. Metrics are team-scoped, not org-wide.",
  },
  {
    test_id: "ri-subadmin-has-checkins",
    name: "Subadmin has /subadmin/check-ins page",
    type: "role_isolation",
    description: "Subadmin navigates to /subadmin/check-ins. Page shows team check-in status.",
    pass_condition: "Status 200. Page contains team member handoff status.",
  },
  {
    test_id: "ri-subadmin-has-team",
    name: "Subadmin has /subadmin/people page",
    type: "role_isolation",
    description: "Subadmin navigates to /subadmin/people. Page renders with team member list.",
    pass_condition: "Status 200. Page contains only their team members, not all org members.",
  },
  {
    test_id: "ri-subadmin-no-approvals",
    name: "Subadmin does NOT have admin Approvals page",
    type: "role_isolation",
    description: "Subadmin tries to navigate to /admin/approvals.",
    pass_condition: "Redirect to /subadmin/overview or 403.",
  },
  {
    test_id: "ri-subadmin-no-admin-people",
    name: "Subadmin does NOT have admin People page",
    type: "role_isolation",
    description: "Subadmin tries to navigate to /admin/people (admin-level people management).",
    pass_condition: "Redirect or 403. Subadmin sees /subadmin/people (team view) but not /admin/people (org-level provisioning).",
  },
  {
    test_id: "ri-subadmin-no-reports",
    name: "Subadmin does NOT have Reports page",
    type: "role_isolation",
    description: "Subadmin tries to navigate to /admin/reports.",
    pass_condition: "Redirect or 403. Subadmin never sees org-wide analytics.",
  },
  {
    test_id: "ri-subadmin-no-sites",
    name: "Subadmin does NOT have Sites management page",
    type: "role_isolation",
    description: "Subadmin tries to navigate to /admin/sites.",
    pass_condition: "Redirect or 403. Subadmin cannot manage sites.",
  },

  // ── Nav Isolation (what links are rendered) ──
  {
    test_id: "ri-nav-admin-items",
    name: "Admin nav shows exactly: Overview, Tasks, Approvals, Messages, Teams, People, Reports, More",
    type: "role_isolation",
    description: "Render admin sidebar. Assert exact nav items and no employee/subadmin-only items like My Day or Check-ins.",
    pass_condition: "Nav contains exactly 8 items. No My Day, no Handoff, no Check-ins.",
  },
  {
    test_id: "ri-nav-employee-items",
    name: "Employee nav shows exactly: My Day, Tasks, Handoff, Messages, More",
    type: "role_isolation",
    description: "Render employee sidebar. Assert exact nav items and no admin-only items like Approvals, People, Reports, Sites.",
    pass_condition: "Nav contains exactly 5 items. No Approvals, no People, no Reports, no Sites, no Overview.",
  },
  {
    test_id: "ri-nav-subadmin-items",
    name: "Subadmin nav shows exactly: Overview, Tasks, Check-ins, Messages, Team, More",
    type: "role_isolation",
    description: "Render subadmin sidebar. Assert exact nav items and no admin-only items like Approvals, Reports, Sites.",
    pass_condition: "Nav contains exactly 6 items. No Approvals, no Reports, no Sites, no My Day.",
  },

  // ── Cross-role API boundary enforcement ──
  {
    test_id: "ri-employee-api-blocked-admin-routes",
    name: "Employee is blocked from ALL admin API routes",
    type: "role_isolation",
    description: "Employee session calls every /api/admin/* endpoint. All must return 403.",
    pass_condition: "POST /api/admin/people → 403. PATCH /api/admin/people/[id] → 403. DELETE /api/admin/people/[id] → 403. GET /api/admin/export → 403.",
  },
];

// ─── Task State Machine Contract Tests (13) ──────────────────────────

export const STATE_MACHINE_TESTS: RequiredTest[] = [
  {
    test_id: "sm-happy-path",
    name: "Happy path: create → approve → start → submit → verify",
    type: "state_machine",
    description: "Full lifecycle. Each transition succeeds in sequence.",
    pass_condition: "Final status is verified. verifiedAt and completedAt are set.",
  },
  {
    test_id: "sm-rework-cycle",
    name: "Rework: submitted → in_progress via requestRework",
    type: "state_machine",
    description: "Manager requests rework. Task returns to in_progress. reworkCount increments.",
    pass_condition: "Status is in_progress. reworkCount = previous + 1. isReworked = true.",
  },
  {
    test_id: "sm-rework-escalation",
    name: "Rework escalation: priority → critical after threshold",
    type: "state_machine",
    description: "Rework N times past orgSettings.reworkAlertCycles. Priority auto-escalates.",
    pass_condition: "priority = critical after exceeding threshold.",
  },
  {
    test_id: "sm-invalid-open-to-verified",
    name: "Invalid: open → verified (skip steps)",
    type: "state_machine",
    description: "Try to transition directly from open to verified.",
    pass_condition: "Status 400 or 403. Task status unchanged.",
  },
  {
    test_id: "sm-invalid-pending-to-submitted",
    name: "Invalid: pending_approval → submitted",
    type: "state_machine",
    description: "Try to transition from pending_approval to submitted.",
    pass_condition: "Status 400 or 403. Task status unchanged.",
  },
  {
    test_id: "sm-employee-cannot-approve",
    name: "Employee cannot approve their own task",
    type: "state_machine",
    description: "Employee who created a pending_approval task tries to approve it.",
    pass_condition: "Status 403.",
  },
  {
    test_id: "sm-employee-cannot-verify",
    name: "Employee cannot verify tasks",
    type: "state_machine",
    description: "Employee tries to call the verify endpoint.",
    pass_condition: "Status 403.",
  },
  {
    test_id: "sm-non-assignee-cannot-submit",
    name: "Non-assignee cannot submit",
    type: "state_machine",
    description: "Admin (not the assignee) tries to submit a task.",
    pass_condition: "Status 403. Only the assignee can transition to submitted.",
  },
  {
    test_id: "sm-delegation",
    name: "Delegation changes assignee and logs audit",
    type: "state_machine",
    description: "Subadmin delegates task to a team member.",
    pass_condition: "assignedToMembershipId changed. TaskAudit with type='delegated' created.",
  },
  {
    test_id: "sm-delegation-scope",
    name: "Subadmin cannot delegate outside team",
    type: "state_machine",
    description: "Subadmin tries to delegate to a member not in their team.",
    pass_condition: "Status 403.",
  },
  {
    test_id: "sm-no-change",
    name: "No-change sets timestamp and creates audit",
    type: "state_machine",
    description: "Assignee marks no change on an in-progress task.",
    pass_condition: "lastNoChangeAt is set. TaskAudit with type='no_change' created.",
  },
  {
    test_id: "sm-note",
    name: "Note creates audit and updates lastActivityAt",
    type: "state_machine",
    description: "Any member adds a note to a task.",
    pass_condition: "TaskAudit with type='note' created. lastActivityAt updated.",
  },
  {
    test_id: "sm-audit-trail",
    name: "Every transition creates an audit entry",
    type: "state_machine",
    description: "Run the full happy path and check that each step has a corresponding TaskAudit.",
    pass_condition: "TaskAudit count matches number of transitions. Each has correct type and actorMembershipId.",
  },
];

// ─── All Tests Combined ──────────────────────────────────────────────

export const ALL_CONTRACT_TESTS: RequiredTest[] = [
  ...API_ROUTE_TESTS,
  ...ROLE_VISIBILITY_TESTS,
  ...ROLE_ISOLATION_TESTS,
  ...STATE_MACHINE_TESTS,
];

// ─── Test Categories for Selective Runs ──────────────────────────────

export type ContractTestCategory = "api_routes" | "role_visibility" | "role_isolation" | "state_machine" | "all";

export function getTestsByCategory(category: ContractTestCategory): RequiredTest[] {
  switch (category) {
    case "api_routes": return API_ROUTE_TESTS;
    case "role_visibility": return ROLE_VISIBILITY_TESTS;
    case "role_isolation": return ROLE_ISOLATION_TESTS;
    case "state_machine": return STATE_MACHINE_TESTS;
    case "all": return ALL_CONTRACT_TESTS;
  }
}

// ─── Seed Requirements ──────────────────────────────────────────────

export interface SeedRequirement {
  test_id: string;
  needs: string[];
}

export const SEED_REQUIREMENTS: SeedRequirement[] = [
  // API routes
  { test_id: "ct-task-create", needs: ["user", "org", "membership:admin", "site", "team"] },
  { test_id: "ct-task-status", needs: ["user", "org", "membership:admin", "task:open"] },
  { test_id: "ct-task-approve", needs: ["user", "org", "membership:admin", "task:pending_approval"] },
  { test_id: "ct-task-verify", needs: ["user", "org", "membership:admin", "task:submitted"] },
  { test_id: "ct-task-delegate", needs: ["user", "org", "membership:admin", "membership:employee", "task:open"] },
  { test_id: "ct-task-note", needs: ["user", "org", "membership:admin", "task:open"] },
  { test_id: "ct-task-rework", needs: ["user", "org", "membership:admin", "task:submitted"] },
  { test_id: "ct-task-nochange", needs: ["user", "org", "membership:employee", "task:in_progress"] },
  { test_id: "ct-avail-create", needs: ["user", "org", "membership:employee"] },
  { test_id: "ct-avail-approve", needs: ["user", "org", "membership:admin", "availability:pending"] },
  { test_id: "ct-avail-reject", needs: ["user", "org", "membership:admin", "availability:pending"] },
  { test_id: "ct-handoff-complete", needs: ["user", "org", "membership:employee", "task:in_progress"] },
  { test_id: "ct-people-create", needs: ["user", "org", "membership:admin"] },
  { test_id: "ct-people-update", needs: ["user", "org", "membership:admin", "membership:employee"] },
  { test_id: "ct-people-delete", needs: ["user", "org", "membership:admin", "membership:employee"] },
  { test_id: "ct-export-tasks", needs: ["user", "org", "membership:admin", "task:open"] },
  { test_id: "ct-export-audit", needs: ["user", "org", "membership:admin", "task:open", "task_audit"] },
  { test_id: "ct-auth-no-session", needs: [] },
  { test_id: "ct-auth-wrong-role", needs: ["user", "org", "membership:employee"] },

  // Role visibility — all need 3 users with different roles
  ...ROLE_VISIBILITY_TESTS.map(t => ({
    test_id: t.test_id,
    needs: ["user:admin", "user:subadmin", "user:employee", "org", "membership:admin", "membership:subadmin", "membership:employee", "site", "team"],
  })),

  // Role isolation — each needs authenticated sessions for all 3 roles
  ...ROLE_ISOLATION_TESTS.map(t => ({
    test_id: t.test_id,
    needs: ["user:admin", "user:subadmin", "user:employee", "org", "membership:admin", "membership:subadmin", "membership:employee", "site", "team", "auth_session:admin", "auth_session:subadmin", "auth_session:employee"],
  })),

  // State machine — need full org setup
  ...STATE_MACHINE_TESTS.map(t => ({
    test_id: t.test_id,
    needs: ["user:admin", "user:employee", "org", "membership:admin", "membership:employee", "site", "team", "org_settings"],
  })),
];

// ─── Feature-to-Test Audit Map ───────────────────────────────────────

export interface FeatureAudit {
  feature_id: string;
  name: string;
  user_expectation: string;
  mapped_tests: string[];
  audit_gate: number; // number of tests that must pass
}

export const FEATURE_AUDIT_MAP: FeatureAudit[] = [
  {
    feature_id: "feat-task-management",
    name: "Task Management",
    user_expectation: "Create, assign, track, and complete tasks with status transitions",
    mapped_tests: [
      "ct-task-create", "ct-task-status", "ct-task-note", "ct-task-nochange",
      "rv-tasks-admin", "rv-tasks-subadmin", "rv-tasks-employee",
      "rv-task-create-admin", "rv-task-create-subadmin", "rv-task-create-employee",
      "sm-happy-path", "sm-audit-trail",
    ],
    audit_gate: 12,
  },
  {
    feature_id: "feat-approval-workflow",
    name: "Approval Workflow",
    user_expectation: "Pending tasks require admin/subadmin approval. Submitted tasks require verification. Self-approval is blocked.",
    mapped_tests: [
      "ct-task-approve", "ct-task-verify", "ct-task-rework",
      "rv-approve-subadmin-scope", "rv-approve-employee-blocked",
      "sm-employee-cannot-approve", "sm-employee-cannot-verify",
      "sm-rework-cycle", "sm-rework-escalation",
      "sm-invalid-open-to-verified", "sm-invalid-pending-to-submitted",
    ],
    audit_gate: 11,
  },
  {
    feature_id: "feat-delegation",
    name: "Task Delegation",
    user_expectation: "Admin/subadmin can reassign tasks. Subadmin cannot delegate outside their teams.",
    mapped_tests: [
      "ct-task-delegate",
      "sm-delegation", "sm-delegation-scope", "sm-non-assignee-cannot-submit",
    ],
    audit_gate: 4,
  },
  {
    feature_id: "feat-availability",
    name: "Availability / Leave Management",
    user_expectation: "Employees request leave. Admins approve or reject. Each role sees only their scope.",
    mapped_tests: [
      "ct-avail-create", "ct-avail-approve", "ct-avail-reject",
      "rv-avail-admin", "rv-avail-subadmin", "rv-avail-employee",
    ],
    audit_gate: 6,
  },
  {
    feature_id: "feat-handoffs",
    name: "Daily Handoffs",
    user_expectation: "Employees complete daily handoffs summarizing their work.",
    mapped_tests: ["ct-handoff-complete"],
    audit_gate: 1,
  },
  {
    feature_id: "feat-people-management",
    name: "People Management",
    user_expectation: "Admin provisions, updates, and removes employees. Non-admins cannot access.",
    mapped_tests: [
      "ct-people-create", "ct-people-update", "ct-people-delete",
      "rv-people-admin-only",
    ],
    audit_gate: 4,
  },
  {
    feature_id: "feat-reporting",
    name: "Reporting / Metrics",
    user_expectation: "Admin sees org-wide metrics. Subadmin sees team-scoped. Employee cannot access.",
    mapped_tests: ["rv-metrics-admin", "rv-metrics-subadmin"],
    audit_gate: 2,
  },
  {
    feature_id: "feat-export",
    name: "Data Export",
    user_expectation: "Admin exports tasks and audit logs as CSV. Non-admins cannot access.",
    mapped_tests: ["ct-export-tasks", "ct-export-audit", "rv-export-admin-only"],
    audit_gate: 3,
  },
  {
    feature_id: "feat-auth",
    name: "Authentication",
    user_expectation: "Unauthenticated users are rejected. Wrong roles are blocked from restricted endpoints.",
    mapped_tests: ["ct-auth-no-session", "ct-auth-wrong-role"],
    audit_gate: 2,
  },
  {
    feature_id: "feat-notifications",
    name: "Notifications",
    user_expectation: "Users receive notifications for task events. Notifications are scoped to the recipient.",
    mapped_tests: ["sm-rework-cycle", "sm-rework-escalation"],
    audit_gate: 2,
  },
  {
    feature_id: "feat-messaging",
    name: "Messaging",
    user_expectation: "Users can send and receive messages within their conversations.",
    mapped_tests: [], // Contract tests pending — E2E messaging.spec.ts covers this for now
    audit_gate: 0,
  },

  // ── Role Isolation (cross-cutting — applies to all roles) ──
  {
    feature_id: "feat-role-isolation",
    name: "Role Isolation",
    user_expectation: "Each role only sees pages and features they are supposed to. Admin never sees employee-only pages. Employee never sees admin pages. No role can access another role's routes or nav items.",
    mapped_tests: [
      // Admin has correct pages
      "ri-admin-has-overview", "ri-admin-has-approvals", "ri-admin-has-people",
      "ri-admin-has-reports", "ri-admin-has-sites",
      // Admin doesn't have employee pages
      "ri-admin-no-my-day", "ri-admin-no-checkin",
      // Employee has correct pages
      "ri-employee-has-myday", "ri-employee-has-checkin",
      // Employee doesn't have admin pages
      "ri-employee-no-approvals", "ri-employee-no-people",
      "ri-employee-no-reports", "ri-employee-no-sites", "ri-employee-no-task-create",
      // Subadmin has correct pages
      "ri-subadmin-has-overview", "ri-subadmin-has-checkins", "ri-subadmin-has-team",
      // Subadmin doesn't have admin-only pages
      "ri-subadmin-no-approvals", "ri-subadmin-no-admin-people",
      "ri-subadmin-no-reports", "ri-subadmin-no-sites",
      // Nav isolation
      "ri-nav-admin-items", "ri-nav-employee-items", "ri-nav-subadmin-items",
      // API boundary
      "ri-employee-api-blocked-admin-routes",
    ],
    audit_gate: 25,
  },
];

// ─── Dynamic Build Feature Gate ──────────────────────────────────────
// Any feature listed during a build MUST have a test mapping.
// If a build introduces a feature not in FEATURE_AUDIT_MAP, the build
// is BLOCKED until tests are added.

/**
 * Check if all features from a build have test mappings.
 * Returns list of unmapped features that block the build.
 */
export function checkBuildFeatureCoverage(
  buildFeatureIds: string[]
): { covered: string[]; unmapped: string[]; blocked: boolean } {
  const knownFeatureIds = new Set(FEATURE_AUDIT_MAP.map(f => f.feature_id));
  const covered: string[] = [];
  const unmapped: string[] = [];

  for (const fid of buildFeatureIds) {
    if (knownFeatureIds.has(fid)) {
      const feature = FEATURE_AUDIT_MAP.find(f => f.feature_id === fid)!;
      if (feature.mapped_tests.length > 0) {
        covered.push(fid);
      } else {
        unmapped.push(fid); // Feature exists but has zero tests
      }
    } else {
      unmapped.push(fid); // Feature not in map at all
    }
  }

  return {
    covered,
    unmapped,
    blocked: unmapped.length > 0,
  };
}

/**
 * Register a new feature discovered during a build.
 * Returns the feature stub that must be filled with tests before the build can proceed.
 */
export function createFeatureStub(
  featureId: string,
  name: string,
  userExpectation: string
): FeatureAudit {
  return {
    feature_id: featureId,
    name,
    user_expectation: userExpectation,
    mapped_tests: [], // BLOCKED until tests are added
    audit_gate: 0,
  };
}

/**
 * Run a feature-level audit. Returns pass/fail per feature based on test results.
 */
export interface FeatureAuditResult {
  feature_id: string;
  name: string;
  passed: boolean;
  tests_passed: number;
  tests_failed: number;
  tests_total: number;
  failed_test_ids: string[];
  coverage_percent: number;
}

export function runFeatureAudit(
  testResults: Record<string, { passed: boolean }>
): FeatureAuditResult[] {
  return FEATURE_AUDIT_MAP.map(feature => {
    const results = feature.mapped_tests.map(testId => ({
      testId,
      passed: testResults[testId]?.passed ?? false,
    }));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const failedIds = results.filter(r => !r.passed).map(r => r.testId);

    // Feature with zero mapped tests is BLOCKED (not passed)
    const featurePassed = feature.mapped_tests.length > 0
      ? failed === 0
      : false;

    return {
      feature_id: feature.feature_id,
      name: feature.name,
      passed: featurePassed,
      tests_passed: passed,
      tests_failed: failed,
      tests_total: feature.mapped_tests.length,
      failed_test_ids: failedIds,
      coverage_percent: feature.mapped_tests.length > 0
        ? Math.round((passed / feature.mapped_tests.length) * 100)
        : 0,
    };
  });
}

/**
 * Get the overall audit summary across all features.
 */
export function getAuditSummary(
  auditResults: FeatureAuditResult[]
): {
  total_features: number;
  features_passed: number;
  features_failed: number;
  features_blocked: number;
  overall_passed: boolean;
  failed_features: string[];
  blocked_features: string[];
} {
  const passed = auditResults.filter(r => r.passed);
  const failed = auditResults.filter(r => !r.passed && r.tests_total > 0);
  const blocked = auditResults.filter(r => r.tests_total === 0);

  return {
    total_features: auditResults.length,
    features_passed: passed.length,
    features_failed: failed.length,
    features_blocked: blocked.length,
    overall_passed: failed.length === 0 && blocked.length === 0,
    failed_features: failed.map(r => r.name),
    blocked_features: blocked.map(r => r.name),
  };
}

// ─── Summary Statistics ──────────────────────────────────────────────

export const CONTRACT_TEST_SUMMARY = {
  total: ALL_CONTRACT_TESTS.length,
  api_routes: API_ROUTE_TESTS.length,
  role_visibility: ROLE_VISIBILITY_TESTS.length,
  role_isolation: ROLE_ISOLATION_TESTS.length,
  state_machine: STATE_MACHINE_TESTS.length,
  features: FEATURE_AUDIT_MAP.length,
  categories: ["api_routes", "role_visibility", "role_isolation", "state_machine"] as const,
};
