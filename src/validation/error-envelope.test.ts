// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Schema shape tests for the canonical error envelope. */

import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import { ErrorEnvelope, } from "./error-envelope";

describe("ErrorEnvelope", () => {
  test("accepts a minimal envelope", () => {
    expect(Value.Check(ErrorEnvelope, {
      error_code: "NOT_FOUND",
      message: "Nope",
      request_id: "req-1",
    },),).toBe(true,);
  });

  test("accepts a full envelope", () => {
    expect(Value.Check(ErrorEnvelope, {
      error_code: "TOO_MANY_REQUESTS",
      message: "Slow down",
      details: { limit: 10, },
      request_id: "req-2",
      retry_after_ms: 500,
    },),).toBe(true,);
  });

  test("rejects a missing error_code", () => {
    expect(Value.Check(ErrorEnvelope, { message: "x", request_id: "r", },),).toBe(false,);
  });

  test("rejects a missing request_id", () => {
    expect(Value.Check(ErrorEnvelope, { error_code: "SERVER_ERROR", message: "x", },),).toBe(false,);
  });

  test("rejects a missing message", () => {
    expect(Value.Check(ErrorEnvelope, { error_code: "SERVER_ERROR", request_id: "r", },),).toBe(false,);
  });
});
