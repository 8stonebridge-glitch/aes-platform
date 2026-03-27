/**
 * E2E Test: History Tab & Governance — attention queue, escalation actions,
 * build replay, pending decisions.
 */

import { test, expect } from "@playwright/test";
import { mockAllAPIs } from "./helpers";

test.describe("History Tab", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test("shows attention queue with blocked builds and escalations", async ({ page }) => {
    await page.goto("/");

    // Switch to History tab
    await page.locator("button", { hasText: "History" }).click();

    // Wait for attention queue to load
    await page.waitForTimeout(2000);

    // Should show attention queue header
    await expect(page.locator("text=Attention Queue")).toBeVisible();

    // Should show blocked builds
    await expect(page.locator("text=Blocked Builds")).toBeVisible();
    await expect(page.locator("text=BLD-blocked-001")).toBeVisible();
    await expect(page.locator("text=BLOCKED")).toBeVisible();

    // Should show pending escalations
    await expect(page.locator("text=Pending Escalations")).toBeVisible();
    await expect(page.locator("text=esc-001")).toBeVisible();
  });

  test("can approve an escalation", async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Find approve button on the escalation
    const approveButton = page.locator("button", { hasText: "Approve" }).first();
    await expect(approveButton).toBeVisible();

    // Click approve
    await approveButton.click();

    // Should show loading state then remove the item
    await page.waitForTimeout(1000);

    // Escalation should be removed from the list
    await expect(page.locator("text=esc-001")).not.toBeVisible({ timeout: 5000 });
  });

  test("can reject an escalation", async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Find reject button
    const rejectButton = page.locator("button", { hasText: "Reject" }).first();
    await expect(rejectButton).toBeVisible();

    // Click reject
    await rejectButton.click();

    await page.waitForTimeout(1000);

    // Escalation should be removed
    await expect(page.locator("text=esc-001")).not.toBeVisible({ timeout: 5000 });
  });

  test("can load build replay", async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Build Replay section should exist
    await expect(page.locator("text=Build Replay")).toBeVisible();

    // Enter a build ID
    const input = page.locator('input[placeholder*="BLD"]');
    await expect(input).toBeVisible();
    await input.fill("BLD-blocked-001");

    // Click Load
    const loadButton = page.locator("button", { hasText: "Load" });
    await loadButton.click();

    await page.waitForTimeout(1000);

    // Replay data should appear
    await expect(page.locator("text=BLD-blocked-001")).toBeVisible();
    await expect(page.locator("text=BLOCKED")).toBeVisible();
  });

  test("blocked build has retry button", async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Blocked builds should have retry or replay button
    const retryButton = page.locator("button", { hasText: "Retry" }).or(
      page.locator("button", { hasText: "Load replay" })
    );
    await expect(retryButton.first()).toBeVisible();
  });

  test("shows empty state when no attention items", async ({ page }) => {
    // Override attention queue with empty data
    await page.route("**/api/attention-queue", (route) =>
      route.fulfill({
        json: {
          pending_escalations: [],
          blocked_builds: [],
          verified_restricted_write_backs: [],
          stale_bridges: [],
        },
      })
    );

    await page.goto("/");
    await page.locator("button", { hasText: "History" }).click();
    await page.waitForTimeout(2000);

    // Should show empty state
    await expect(page.locator("text=No items needing attention")).toBeVisible();
  });
});
