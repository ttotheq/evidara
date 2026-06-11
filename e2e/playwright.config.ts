import { defineConfig, devices } from "@playwright/test";
import { WEB_URL } from "./stack.js";

export default defineConfig({
  testDir: "./tests",
  // The single spec walks the whole workflow in order; no parallelism.
  workers: 1,
  fullyParallel: false,
  // Plan rule: flaky retries must not conceal nondeterministic tests.
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
