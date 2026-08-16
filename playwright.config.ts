// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Playwright Configuration
 *
 * Browser E2E tests for loop-lore web UI.
 * Uses bun:test runner with Playwright browser fixture.
 *
 * Note: Tests are run via `bun test tests/e2e/flows/browser/*.browser.ts`
 * This config is for Playwright-specific settings (browser launch, viewport, etc).
 */
import { defineConfig, } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/flows/browser",
  testMatch: "**/*.browser.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [
    ["list",],
    ["html", { open: "never", outputFolder: "playwright-report", },],
  ],
  use: {
    baseURL: "http://localhost:0",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900, },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        },
      },
    },
  ],
  outputDir: "test-results",
},);
