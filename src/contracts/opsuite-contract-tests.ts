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
  ...STATE_MACHINE_TESTS,
];

// ─── Test Categories for Selective Runs ──────────────────────────────

export type ContractTestCategory = "api_routes" | "role_visibility" | "state_machine" | "all";

export function getTestsByCategory(category: ContractTestCategory): RequiredTest[] {
  switch (category) {
    case "api_routes": return API_ROUTE_TESTS;
    case "role_visibility": return ROLE_VISIBILITY_TESTS;
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

  // State machine — need full org setup
  ...STATE_MACHINE_TESTS.map(t => ({
    test_id: t.test_id,
    needs: ["user:admin", "user:employee", "org", "membership:admin", "membership:employee", "site", "team", "org_settings"],
  })),
];

// ─── Summary Statistics ──────────────────────────────────────────────

export const CONTRACT_TEST_SUMMARY = {
  total: ALL_CONTRACT_TESTS.length,
  api_routes: API_ROUTE_TESTS.length,
  role_visibility: ROLE_VISIBILITY_TESTS.length,
  state_machine: STATE_MACHINE_TESTS.length,
  categories: ["api_routes", "role_visibility", "state_machine"] as const,
};
