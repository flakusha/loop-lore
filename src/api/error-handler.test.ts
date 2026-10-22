// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Mapping + envelope-shape tests for the canonical error handler. */

import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import { ForbiddenError, NotFoundError, } from "../routes/http-utils/status";
import { ErrorEnvelope, } from "../validation/error-envelope";
import { errorHandler, } from "./error-handler";

describe("errorHandler", () => {
  test("maps NotFoundError to 404 NOT_FOUND", async () => {
    const res = errorHandler(new NotFoundError("World", "w-1",), "req-1",);
    expect(res.status,).toBe(404,);
    const body = await res.json();
    expect(body.error_code,).toBe("NOT_FOUND",);
    expect(body.request_id,).toBe("req-1",);
    expect(Value.Check(ErrorEnvelope, body,),).toBe(true,);
  });

  test("maps ForbiddenError to 403 FORBIDDEN", async () => {
    const res = errorHandler(new ForbiddenError(), "req-2",);
    expect(res.status,).toBe(403,);
    const body = await res.json();
    expect(body.error_code,).toBe("FORBIDDEN",);
    expect(Value.Check(ErrorEnvelope, body,),).toBe(true,);
  });

  test("wraps unknown errors as 500 SERVER_ERROR with envelope shape", async () => {
    for (const err of [new Error("boom",), "string failure", undefined,]) {
      const res = errorHandler(err, "req-3",);
      expect(res.status,).toBe(500,);
      const body = await res.json();
      expect(body.error_code,).toBe("SERVER_ERROR",);
      expect(body.request_id,).toBe("req-3",);
      expect(Value.Check(ErrorEnvelope, body,),).toBe(true,);
    }
  });
});
