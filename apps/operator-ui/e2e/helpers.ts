/**
 * E2E Test Helpers — mock API server for testing without a live backend.
 *
 * Uses Playwright's route interception to mock all API calls.
 * This lets tests run without Neo4j, Postgres, or the real LangGraph pipeline.
 */

import { type Page } from "@playwright/test";

// ─── Mock Data ──────────────────────────────────────────────────────

export const MOCK_JOB_ID = "j-test1234";
export const MOCK_REQUEST_ID = "req-test5678";

export const MOCK_HEALTH = {
  status: "ok",
  version: "v12",
  math_layer: true,
};

export const MOCK_ORCH_HEALTH = {
  status: "ok",
  version: "v12",
};

export const MOCK_JOB_STATUS = {
  jobId: MOCK_JOB_ID,
  currentGate: "complete",
  intentConfirmed: true,
  userApproved: true,
  features: ["feat-auth", "feat-dashboard", "feat-api"],
  featureBridges: {
    "feat-auth": { bridge_id: "brg-1", feature_name: "Authentication", status: "compiled" },
    "feat-dashboard": { bridge_id: "brg-2", feature_name: "Dashboard", status: "compiled" },
    "feat-api": { bridge_id: "brg-3", feature_name: "API Layer", status: "compiled" },
  },
  appSpec: {
    title: "Test SaaS App",
    app_class: "saas",
    features: 3,
    roles: 2,
    confidence: 0.92,
  },
  vetoResults: [],
  errorMessage: null,
};

export const MOCK_JOB_LIST = [
  {
    jobId: MOCK_JOB_ID,
    intent: "Build a SaaS project management tool with auth, dashboard, and API",
    currentGate: "complete",
    features: 3,
    intentConfirmed: true,
    userApproved: true,
    createdAt: new Date().toISOString(),
  },
  {
    jobId: "j-test9999",
    intent: "Build a booking system for barber shops",
    currentGate: "building",
    features: 5,
    intentConfirmed: true,
    userApproved: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

export const MOCK_JOB_LOGS = [
  { gate: "gate_0", message: "Intake received", timestamp: new Date(Date.now() - 60000).toISOString() },
  { gate: "gate_0", message: "Graph context loaded: 5 prior builds", timestamp: new Date(Date.now() - 55000).toISOString() },
  { gate: "research", message: "Researching patterns...", timestamp: new Date(Date.now() - 50000).toISOString() },
  { gate: "gate_1", message: "Decomposed into 3 features", timestamp: new Date(Date.now() - 40000).toISOString() },
  { gate: "gate_2", message: "Spec validation passed", timestamp: new Date(Date.now() - 30000).toISOString() },
  { gate: "complete", message: "Pipeline complete", timestamp: new Date(Date.now() - 10000).toISOString() },
];

export const MOCK_ATTENTION_QUEUE = {
  pending_escalations: [
    {
      internal_id: "esc-001",
      artifact_type: "escalation",
      artifact_id: "esc-001",
      sequence_number: 1,
      payload: { status: "PENDING_REVIEW", feature_id: "feat-payments" },
    },
  ],
  blocked_builds: [
    {
      internal_id: "blk-001",
      artifact_type: "build",
      artifact_id: "BLD-blocked-001",
      sequence_number: 1,
      payload: { status: "BLOCKED", feature_id: "feat-notifications", queued_at: new Date().toISOString() },
    },
  ],
  verified_restricted_write_backs: [],
  stale_bridges: [],
};

export const MOCK_GOVERNANCE_PENDING = [
  {
    jobId: "j-pending01",
    type: "needs_approval",
    intent: "Build an e-commerce platform",
    currentGate: "gate_1",
    createdAt: new Date().toISOString(),
  },
];

// ─── Route Interceptors ──────────────────────────────────────────────

/**
 * Set up all mock API routes for the operator UI.
 * Call this in beforeEach to ensure every test has consistent mocks.
 */
export async function mockAllAPIs(page: Page) {
  // Health endpoints
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: MOCK_HEALTH })
  );
  await page.route("**/orchestrator/health", (route) =>
    route.fulfill({ json: MOCK_ORCH_HEALTH })
  );

  // Job endpoints
  await page.route("**/orchestrator/jobs", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: MOCK_JOB_LIST });
    }
    return route.continue();
  });

  await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: MOCK_JOB_STATUS });
    }
    return route.continue();
  });

  await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}/logs`, (route) =>
    route.fulfill({ json: MOCK_JOB_LOGS })
  );

  // Build start
  await page.route("**/orchestrator/build", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: { jobId: MOCK_JOB_ID, requestId: MOCK_REQUEST_ID, status: "started" },
      });
    }
    return route.continue();
  });

  // Confirm + approve
  await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}/confirm`, (route) =>
    route.fulfill({ json: { confirmed: true } })
  );
  await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}/approve`, (route) =>
    route.fulfill({ json: { approved: true } })
  );

  // Attention queue
  await page.route("**/api/attention-queue", (route) =>
    route.fulfill({ json: MOCK_ATTENTION_QUEUE })
  );

  // Governance
  await page.route("**/api/governance/pending", (route) =>
    route.fulfill({ json: MOCK_GOVERNANCE_PENDING })
  );
  await page.route("**/api/governance/escalations/*/approve", (route) =>
    route.fulfill({ json: { status: "approved" } })
  );
  await page.route("**/api/governance/escalations/*/reject", (route) =>
    route.fulfill({ json: { status: "rejected" } })
  );

  // Build replay
  await page.route("**/api/builds/*/replay", (route) =>
    route.fulfill({
      json: {
        build_id: "BLD-blocked-001",
        build: { payload: { status: "BLOCKED", feature_id: "feat-notifications" } },
        diff: { files_changed: 3 },
        test_run: null,
        validation: null,
      },
    })
  );

  // Agent status (legacy)
  await page.route("**/api/agent-status", (route) =>
    route.fulfill({ json: { phase: "idle", app_id: "", feature_id: "", started_at: "", total_features: 0, completed_features: 0, failed_features: 0, blocked_features: 0, agents: {} } })
  );

  // Orchestrator live / events (legacy polling)
  await page.route("**/api/orchestrator/live", (route) =>
    route.fulfill({ json: { status: "idle", phase: "idle", app_id: "", features: [] } })
  );
  await page.route("**/api/orchestrator/events", (route) =>
    route.fulfill({ json: [] })
  );

  // Features + audit for job detail page
  await page.route("**/api/jobs/*/features", (route) =>
    route.fulfill({ json: { features: [], bridges: {} } })
  );
  await page.route("**/api/jobs/*/audit", (route) =>
    route.fulfill({ json: { logs: MOCK_JOB_LOGS, fixTrails: [], builderRuns: [] } })
  );

  // Feature audit
  await page.route("**/api/features/*/audit", (route) =>
    route.fulfill({ json: { feature_id: "unknown", logs: [] } })
  );

  // Escalation approve/reject (via legacy API path)
  await page.route("**/api/governance/escalations/esc-001/approve", (route) =>
    route.fulfill({ json: { status: "approved" } })
  );
  await page.route("**/api/governance/escalations/esc-001/reject", (route) =>
    route.fulfill({ json: { status: "rejected" } })
  );
}

/**
 * Mock the SSE stream endpoint to simulate real-time events.
 * Returns a function to push events to the stream.
 */
export async function mockSSEStream(page: Page, jobId: string) {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  let resolver: (() => void) | null = null;

  await page.route(`**/api/jobs/${jobId}/stream`, (route) => {
    // Return SSE response
    const body = events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
      .join("");

    route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: `event: connected\ndata: ${JSON.stringify({ jobId })}\n\n${body}`,
    });
  });

  return {
    pushEvent(event: string, data: Record<string, unknown>) {
      events.push({ event, data });
    },
  };
}
