import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Sequential — tests build on each other
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    // AES Platform (orchestrator API)
    {
      command: "cd ../../aes-platform && npx tsx src/api/index.ts",
      port: 3100,
      timeout: 30_000,
      reuseExistingServer: true,
    },
    // Next.js dev server
    {
      command: "npm run dev",
      port: 3001,
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
});
