// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Playwright Configuration (documentation only)
//
// Tests run via: bun test tests/e2e/flows/browser/*.browser.ts
// using the createBrowserTest() fixture — NOT the @playwright/test runner.
//
// The values below document the effective runtime contract for browser tests
// even though this file is not consumed by bun:test.
//
// ## Relevant values
//
// timeout: 30_000 ms per test
// expect.timeout: 5_000 ms per expect
// workers: 1 (tests share a single DB via transactions; parallel = false)
// retries: 1 (flaky network tests get one retry)
// viewport: { width: 1440, height: 900 }
// actionTimeout: 10_000 ms
// navigationTimeout: 15_000 ms
//
// ## Browser launch args (chromium, headless)
//
// --no-sandbox
// --disable-setuid-sandbox
// --disable-dev-shm-usage
//
// ## Test discovery
//
// Tests live in ./tests/e2e/flows/browser/*.browser.ts and are picked up
// by the glob **/*.browser.ts pattern.
//
// ## Reports
//
// HTML report goes to .tmp/playwright-report (not used by bun:test runner).
//
// ## Why not consumed
//
// createBrowserTest() constructs a BrowserTestContext that wraps a raw
// Playwright chromium browser instance directly. It does NOT go through
// @playwright/test's webServer/config pipeline, so this file has no
// effect on test execution. Keeping it as a comment block preserves the
// useful documentation without lying about being an active config.

export {};
// This file intentionally contains only export {} to keep TypeScript happy.
// All content is documentation via // line comments above.
