// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `IDEMPOTENCY_DEFAULTS` in `src/config/schema-class/idempotency.ts`.
 *
 * The default `backend` is `"table"` (not `"memory"`) so the async result
 * store writes to `request_results` out of the box. The previous default
 * `"memory"` left `track()` a no-op for single-instance installs, defeating
 * idempotency table-backend replay and `/api/requests/:id/status`.
 *
 * @see BUG-bug-async-result-store-track-never-called-request-results-pi.md
 */

import { describe, expect, test, } from "bun:test";
import { IDEMPOTENCY_DEFAULTS, } from "./idempotency";

describe("IDEMPOTENCY_DEFAULTS", () => {
  test('backend defaults to "table" so asyncStore.track() runs by default', () => {
    // Bug regression guard: flipping back to "memory" silently disables
    // /api/requests/:id/status for every install that doesn't override.
    expect(IDEMPOTENCY_DEFAULTS.backend,).toBe("table",);
  });

  test("enabled defaults to true", () => {
    expect(IDEMPOTENCY_DEFAULTS.enabled,).toBe(true,);
  });

  test("ttlMs is 24h", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(IDEMPOTENCY_DEFAULTS.ttlMs,).toBe(DAY_MS,);
  });

  test("bypassHeader defaults to true", () => {
    expect(IDEMPOTENCY_DEFAULTS.bypassHeader,).toBe(true,);
  });
});
