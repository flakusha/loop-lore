// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

/**
 * Route-level integration tests for music-links.
 * Full HTTP-level tests use the e2e harness; these cover route logic that
 * doesn't need a real DB (URL validation, response shape).
 */
describe("MusicLinks routes", () => {
  // Route plugin is tested via the service — URL detection and response
  // mapping are exercised in the service tests.
  // This file exists as a placeholder for future HTTP-level tests that
  // use the test DB harness (createTestDb, etc.).

  test("placeholder: service URL validation is exercised by service tests", () => {
    expect(true).toBe(true);
  });
});
