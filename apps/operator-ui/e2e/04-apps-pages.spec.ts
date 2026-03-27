/**
 * E2E Test: Apps Pages — job listing, search/filter, detail page.
 */

import { test, expect } from "@playwright/test";
import { mockAllAPIs, MOCK_JOB_ID, MOCK_JOB_STATUS, MOCK_JOB_LOGS } from "./helpers";

test.describe("Apps Listing Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test("shows list of jobs as app cards", async ({ page }) => {
    await page.goto("/apps");

    await page.waitForTimeout(2000);

    // Should show job cards
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();
    await expect(page.locator("text=j-test9999")).toBeVisible();

    // Should show intent text
    await expect(page.locator("text=SaaS project management")).toBeVisible();
    await expect(page.locator("text=booking system")).toBeVisible();
  });

  test("shows gate badges with correct colors", async ({ page }) => {
    await page.goto("/apps");
    await page.waitForTimeout(2000);

    // Should show gate badges
    await expect(page.locator("text=complete")).toBeVisible();
    await expect(page.locator("text=building")).toBeVisible();
  });

  test("search filters jobs", async ({ page }) => {
    await page.goto("/apps");
    await page.waitForTimeout(2000);

    // Find search input
    const search = page.locator('input[placeholder*="earch"], input[placeholder*="ilter"]');
    await expect(search).toBeVisible();

    // Search for "barber"
    await search.fill("barber");
    await page.waitForTimeout(500);

    // Only the barber job should be visible
    await expect(page.locator("text=booking system")).toBeVisible();
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).not.toBeVisible();

    // Clear search
    await search.clear();
    await page.waitForTimeout(500);

    // Both should be visible again
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();
    await expect(page.locator("text=j-test9999")).toBeVisible();
  });

  test("clicking a job card navigates to detail page", async ({ page }) => {
    await page.goto("/apps");
    await page.waitForTimeout(2000);

    // Click the first job card
    const card = page.locator(`text=${MOCK_JOB_ID}`).first();
    await card.click();

    // Should navigate to detail page
    await page.waitForURL(`**/apps/${MOCK_JOB_ID}`);
  });

  test("shows feature count on cards", async ({ page }) => {
    await page.goto("/apps");
    await page.waitForTimeout(2000);

    // Feature counts should be visible
    await expect(page.locator("text=3 features").or(page.locator("text=3 feat"))).toBeVisible();
    await expect(page.locator("text=5 features").or(page.locator("text=5 feat"))).toBeVisible();
  });
});

test.describe("App Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);

    // Also mock the direct job status for the detail page
    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: MOCK_JOB_STATUS });
      }
      return route.continue();
    });

    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}/logs`, (route) =>
      route.fulfill({ json: MOCK_JOB_LOGS })
    );
  });

  test("shows job header with ID and gate", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Job ID should be visible
    await expect(page.locator(`text=${MOCK_JOB_ID}`)).toBeVisible();

    // Gate badge
    await expect(page.locator("text=complete")).toBeVisible();
  });

  test("shows app spec details", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // App spec fields
    await expect(page.locator("text=Test SaaS App")).toBeVisible();
    await expect(page.locator("text=saas")).toBeVisible();

    // Confidence should be shown
    await expect(page.locator("text=92%").or(page.locator("text=0.92"))).toBeVisible();
  });

  test("shows feature list", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Feature IDs from bridges
    await expect(page.locator("text=feat-auth").or(page.locator("text=Authentication"))).toBeVisible();
    await expect(page.locator("text=feat-dashboard").or(page.locator("text=Dashboard"))).toBeVisible();
    await expect(page.locator("text=feat-api").or(page.locator("text=API Layer"))).toBeVisible();
  });

  test("shows logs section", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Log entries should appear
    await expect(page.locator("text=Intake received").or(page.locator("text=gate_0"))).toBeVisible();
    await expect(page.locator("text=Pipeline complete").or(page.locator("text=complete"))).toBeVisible();
  });

  test("shows confirmation and approval status", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Intent confirmed + user approved indicators
    await expect(
      page.locator("text=Confirmed").or(page.locator("text=confirmed")).or(page.locator("text=Intent Confirmed"))
    ).toBeVisible();
    await expect(
      page.locator("text=Approved").or(page.locator("text=approved")).or(page.locator("text=User Approved"))
    ).toBeVisible();
  });

  test("has breadcrumb navigation back to apps list", async ({ page }) => {
    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Should have a back link to /apps
    const backLink = page.locator('a[href="/apps"]').or(page.locator("text=Apps").first());
    await expect(backLink).toBeVisible();

    await backLink.click();
    await page.waitForURL("**/apps");
  });

  test("shows error state for failed job", async ({ page }) => {
    // Override with failed job status
    await page.route(`**/orchestrator/jobs/${MOCK_JOB_ID}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          json: {
            ...MOCK_JOB_STATUS,
            currentGate: "failed",
            errorMessage: "Spec validation failed after 3 retries",
          },
        });
      }
      return route.continue();
    });

    await page.goto(`/apps/${MOCK_JOB_ID}`);
    await page.waitForTimeout(2000);

    // Error message should be visible
    await expect(page.locator("text=Spec validation failed")).toBeVisible();
  });
});
