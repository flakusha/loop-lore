// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  IDEMPOTENCY_KEY_HEADER,
  isValidRequestId,
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "./request-id";

describe("isValidRequestId", () => {
  test("accepts UUID v4", () => {
    expect(isValidRequestId("550e8400-e29b-41d4-a716-446655440000",),).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("accepts printable ASCII with allowed punctuation", () => {
    expect(isValidRequestId("abc-123_def.4:5",),).toBe("abc-123_def.4:5",);
  });

  test("trims surrounding whitespace", () => {
    expect(isValidRequestId("  hello  ",),).toBe("hello",);
  });

  test("rejects empty / nullish", () => {
    expect(isValidRequestId("",),).toBeNull();
    expect(isValidRequestId("   ",),).toBeNull();
    expect(isValidRequestId(null,),).toBeNull();
    expect(isValidRequestId(undefined,),).toBeNull();
  });

  test("rejects oversize ids", () => {
    const tooLong = "a".repeat(MAX_REQUEST_ID_LENGTH + 1,);
    expect(isValidRequestId(tooLong,),).toBeNull();
  });

  test("rejects unsafe characters", () => {
    expect(isValidRequestId("has space",),).toBeNull();
    expect(isValidRequestId("has\nnewline",),).toBeNull();
    expect(isValidRequestId("has/slash",),).toBeNull();
    expect(isValidRequestId("has;DROP",),).toBeNull();
    expect(isValidRequestId("<script>",),).toBeNull();
  });
});

describe("resolveRequestId", () => {
  test("honors X-Request-Id when valid", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "client-supplied-1", },);
    expect(resolveRequestId(headers,),).toBe("client-supplied-1",);
  });

  test("falls back to Idempotency-Key when X-Request-Id missing", () => {
    const headers = new Headers({ [IDEMPOTENCY_KEY_HEADER]: "idem-7", },);
    expect(resolveRequestId(headers,),).toBe("idem-7",);
  });

  test("prefers X-Request-Id over Idempotency-Key", () => {
    const headers = new Headers({
      [REQUEST_ID_HEADER]: "primary",
      [IDEMPOTENCY_KEY_HEADER]: "fallback",
    },);
    expect(resolveRequestId(headers,),).toBe("primary",);
  });

  test("falls back to crypto.randomUUID() when headers missing or invalid", () => {
    const empty = new Headers();
    const resolved = resolveRequestId(empty,);
    expect(resolved,).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,);
  });

  test("ignores invalid client-supplied X-Request-Id and falls back", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "has space and ; chars", },);
    const resolved = resolveRequestId(headers,);
    // The id must be a fresh UUID (client input rejected).
    expect(resolved,).toMatch(/^[0-9a-f]{8}-/i,);
    expect(resolved.startsWith("has ",),).toBe(false,);
  });

  test("returns distinct ids for two calls without headers", () => {
    const headers = new Headers();
    expect(resolveRequestId(headers,),).not.toBe(resolveRequestId(headers,),);
  });
});
