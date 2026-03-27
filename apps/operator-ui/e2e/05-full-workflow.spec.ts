/**
 * E2E Test: Full Operator Workflow — end-to-end from intent submission
 * through confirmation, approval, build monitoring, to completion,
 * then verification in the apps detail page and history tab.
 *
 * This is the integration test that validates the complete supervised
 * AES workflow from the operator's perspective.
 */

import { test, expect } from "@playwright/test";
import { mockAllAPIs, mockSSEStream, MOCK_JOB_ID, MOCK_JOB_STATUS } from "./helpers";

test.describe("Full Supervised Workflow", () => {
  test("complete workflow: submit → confirm → approve → build → verify", async ({ page }) => {
    await mockAllAPIs(page);

    // Set up SSE stream with a realistic event sequence
    const sse = await mockSSEStream(page, MOCK_JOB_ID);
    sse.pushEvent("gate", { gate: "gate_0", message: "Processing intake..." });
    sse.pushEvent("step", { message: "Loading graph context: 12 prior builds, 8 features" });
    sse.pushEvent("step", { message: "Vector search enabled — running hybrid keyword + semantic search" });
    sse.pushEvent("step", { message: "Raw keywords: saas, project, management" });
    sse.pushEvent("step", { message: "Expanded to 18 search terms (fan-out)" });
    sse.pushEvent("success", { message: "Graph context loaded: 5 prior builds | LEARNED: 12 features, 4 models | VECTOR-ONLY: 3 semantic matches" });
    sse.pushEvent("gate", { gate: "gate_0", message: "Intent classified: SaaS app, low risk" });
    sse.pushEvent("needs_confirmation", {
      statement: "I understand you want to build a SaaS project management tool with task tracking, team collaboration, and reporting. Is that correct?",
    });

    // ── Step 1: Submit Intent ──
    await page.goto("/");
    const input = page.locator('textarea, input[placeholder*="escribe"], input[placeholder*="intent"], input[placeholder*="build"], input[placeholder*="Build"]').first();
    await input.fill("Build a SaaS project management tool with task tracking, team collaboration, and reporting dashboards");
    const submitButton = page.locator('button:has-text("Build"), button:has-text("Submit"), button:has-text("Start"), button[type="submit"]').first();
    await submitButton.click();

    // Pipeline should start
    await page.waitForTimeout(2000);

    // ── Step 2: Confirmation Gate ──
    // Confirmation dialog should appear
    const confirmButton = page.locator('button:has-text("Confirm")');
    await expect(confirmButton).toBeVisible({ timeout: 10000 });

    // Should show the confirmation statement
    await expect(page.locator("text=project management tool")).toBeVisible();

    await confirmButton.click();
    await page.waitForTimeout(1000);

    // ── Step 3: Approval Gate ──
    // Now override SSE to send approval event
    // (In real flow, SSE would continue after confirmation)
    // We need to mock the job status to reflect post-confirmation state
    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            ...MOCK_JOB_STATUS,
            currentGate: "complete",
            intentConfirmed: true,
            userApproved: true,
          },
        });
      }
      return route.continue();
    });

    // Wait for job status poll to update
    await page.waitForTimeout(4000);

    // ── Step 4: Verify completion ──
    // Should show completion state with app spec
    await expect(
      page.locator("text=Complete")
        .or(page.locator("text=complete"))
        .or(page.locator("text=Test SaaS App"))
        .or(page.locator("text=Pipeline Complete"))
        .or(page.locator("text=Build Complete"))
    ).toBeVisible({ timeout: 15000 });

    // ── Step 5: Check History ──
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Attention queue should load
    await expect(page.locator("text=Attention Queue").or(page.locator("text=Build History"))).toBeVisible();
  });

  test("workflow with approval: shows spec and allows approve", async ({ page }) => {
    await mockAllAPIs(page);

    // SSE sends straight to approval (no confirmation needed)
    const sse = await mockSSEStream(page, MOCK_JOB_ID);
    sse.pushEvent("gate", { gate: "gate_0", message: "Intake processed" });
    sse.pushEvent("gate", { gate: "research", message: "Researching patterns..." });
    sse.pushEvent("gate", { gate: "gate_1", message: "Decomposed into 5 features" });
    sse.pushEvent("needs_approval", {
      prompt: "Review and approve the build plan",
      data: {
        appSpec: {
          title: "Project Manager Pro",
          app_class: "saas",
          summary: "Full-featured SaaS project management platform",
          features: [
            { name: "User Authentication", priority: "critical", feature_type: "auth_sensitive" },
            { name: "Task Board", priority: "critical", feature_type: "crud" },
            { name: "Team Management", priority: "high", feature_type: "crud" },
            { name: "Reporting Dashboard", priority: "high", feature_type: "ui_only" },
            { name: "Notifications", priority: "normal", feature_type: "stateful" },
          ],
          roles: [{ name: "admin" }, { name: "team_lead" }, { name: "member" }],
          confidence: 0.91,
        },
      },
    });

    await page.goto("/");

    // Submit
    const input = page.locator('textarea, input[placeholder*="escribe"], input[placeholder*="intent"], input[placeholder*="build"], input[placeholder*="Build"]').first();
    await input.fill("Build a SaaS PM tool with auth, tasks, teams, dashboards, notifications");
    const submitButton = page.locator('button:has-text("Build"), button:has-text("Submit"), button:has-text("Start"), button[type="submit"]').first();
    await submitButton.click();

    await page.waitForTimeout(3000);

    // Approval dialog should appear with spec details
    const approveButton = page.locator('button:has-text("Approve")');
    await expect(approveButton).toBeVisible({ timeout: 10000 });

    // Spec details should be visible
    await expect(
      page.locator("text=Project Manager Pro")
        .or(page.locator("text=saas"))
        .or(page.locator("text=91%"))
        .or(page.locator("text=5 features"))
    ).toBeVisible();

    // Approve the plan
    await approveButton.click();
    await page.waitForTimeout(1000);

    // Now mock completion
    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            ...MOCK_JOB_STATUS,
            currentGate: "complete",
            appSpec: { title: "Project Manager Pro", app_class: "saas", features: 5, roles: 3, confidence: 0.91 },
          },
        });
      }
      return route.continue();
    });

    await page.waitForTimeout(4000);

    // Should show completion
    await expect(
      page.locator("text=Complete")
        .or(page.locator("text=Project Manager Pro"))
        .or(page.locator("text=5 features"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("workflow interruption: pipeline fails and shows error", async ({ page }) => {
    await mockAllAPIs(page);

    const sse = await mockSSEStream(page, MOCK_JOB_ID);
    sse.pushEvent("gate", { gate: "gate_0", message: "Intake" });
    sse.pushEvent("step", { message: "Graph context loaded" });
    sse.pushEvent("gate", { gate: "gate_1", message: "Decomposing..." });
    sse.pushEvent("fail", { message: "Veto triggered: auth_ambiguity — authentication method unclear" });
    sse.pushEvent("error", { message: "Pipeline blocked by veto: auth_ambiguity" });

    // Override job status to show failed state
    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            ...MOCK_JOB_STATUS,
            currentGate: "failed",
            errorMessage: "Veto triggered: auth_ambiguity",
            vetoResults: [{ rule: "auth_ambiguity", triggered: true, reason: "Authentication method unclear" }],
          },
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const input = page.locator('textarea, input[placeholder*="escribe"], input[placeholder*="intent"], input[placeholder*="build"], input[placeholder*="Build"]').first();
    await input.fill("Build something with login");
    const submitButton = page.locator('button:has-text("Build"), button:has-text("Submit"), button:has-text("Start"), button[type="submit"]').first();
    await submitButton.click();

    await page.waitForTimeout(3000);

    // Error should be visible
    await expect(
      page.locator("text=auth_ambiguity")
        .or(page.locator("text=failed"))
        .or(page.locator("text=Failed"))
        .or(page.locator("text=Veto"))
        .or(page.locator("text=Error"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("cross-page verification: build shows up in apps list", async ({ page }) => {
    await mockAllAPIs(page);

    // Navigate to apps page
    await page.goto("/apps");
    await page.waitForTimeout(2000);

    // Should show the test jobs
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();

    // Click into the detail page
    const card = page.locator(`text=${MOCK_JOB_ID}`).first();
    await card.click();
    await page.waitForURL(`**/apps/${MOCK_JOB_ID}`);

    await page.waitForTimeout(2000);

    // Verify detail page shows full information
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();
    await expect(page.locator("text=complete")).toBeVisible();

    // Navigate back
    const backLink = page.locator('a[href="/apps"]').first();
    await backLink.click();
    await page.waitForURL("**/apps");

    // Should be back on the list
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();
  });
});
