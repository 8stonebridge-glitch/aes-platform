/**
 * E2E Test: Dashboard — page loads, sidebar renders, health indicators work.
 */

import { test, expect } from "@playwright/test";
import { mockAllAPIs } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test("page loads with AES branding and sidebar", async ({ page }) => {
    await page.goto("/");

    // AES logo/brand visible
    await expect(page.locator("text=AES")).toBeVisible();

    // Sidebar nav items
    await expect(page.locator("text=Builds")).toBeVisible();
    await expect(page.locator("text=Graph")).toBeVisible();
    await expect(page.locator("text=History")).toBeVisible();
    await expect(page.locator("text=Apps")).toBeVisible();
  });

  test("health indicator shows connected state", async ({ page }) => {
    await page.goto("/");

    // Wait for health poll to fire
    await page.waitForTimeout(2000);

    // Should show orchestrator connected indicator
    await expect(page.locator("text=Orchestrator")).toBeVisible();
  });

  test("Builds tab is active by default", async ({ page }) => {
    await page.goto("/");

    // The builds tab should be the active one
    const buildsButton = page.locator("button", { hasText: "Builds" });
    await expect(buildsButton).toBeVisible();

    // Intent input should be visible (idle state)
    await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
  });

  test("can switch between tabs", async ({ page }) => {
    await page.goto("/");

    // Click History
    await page.locator("button", { hasText: "History" }).click();
    await expect(page.locator("text=Build History")).toBeVisible();

    // Click Graph
    await page.locator("button", { hasText: "Graph" }).click();
    // Graph tab should render (may show loading or graph component)
    await page.waitForTimeout(500);

    // Click back to Builds
    await page.locator("button", { hasText: "Builds" }).click();
    await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
  });

  test("Apps link navigates to /apps page", async ({ page }) => {
    await page.goto("/");

    await page.locator("a", { hasText: "Apps" }).click();
    await page.waitForURL("**/apps");

    // Should show the apps listing page
    await expect(page.locator("text=Apps")).toBeVisible();
  });
});
