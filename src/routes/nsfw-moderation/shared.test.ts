// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema-level regression tests for `src/routes/nsfw-moderation/shared.ts`.
 *
 * Bug: BUG-resolveflagbody-schema-allows-upheld-but-service-type-expect
 *
 * The `resolveFlagBody` schema must accept the three resolved statuses the
 * `NsfwModerationService.resolveFlag` type allows. The canonical contract
 * is in `src/nsfw/moderation-service/types.ts` and uses:
 *   `"resolved" | "dismissed" | "confirmed"`.
 *
 * The schema previously accepted `"upheld"` instead of `"confirmed"`,
 * creating a mismatch between the API boundary and the service contract.
 * These tests pin the schema enum so future drift is caught at unit
 * level (no need to boot the full HTTP layer).
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import { resolveFlagBody, } from "./shared";

describe("resolveFlagBody schema", () => {
  test("accepts status='confirmed' (canonical disposition)", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "spam confirmed", status: "confirmed", },),)
      .toBe(true,);
  });

  test("accepts status='resolved'", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "kept", status: "resolved", },),)
      .toBe(true,);
  });

  test("accepts status='dismissed'", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "false positive", status: "dismissed", },),)
      .toBe(true,);
  });

  test("rejects status='upheld' (legacy value not in service contract)", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "kept", status: "upheld", },),)
      .toBe(false,);
  });

  test("rejects an unknown status", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "kept", status: "approved", },),)
      .toBe(false,);
  });

  test("rejects a missing resolution", () => {
    expect(Value.Check(resolveFlagBody, { status: "confirmed", },),).toBe(false,);
  });

  test("rejects a missing status", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "kept", },),).toBe(false,);
  });

  test("rejects a non-string status", () => {
    expect(Value.Check(resolveFlagBody, { resolution: "kept", status: 42, },),).toBe(false,);
  });
});
