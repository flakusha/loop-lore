// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for size-limited base64 encode/decode.
 *
 * Every rejection path returns `{ ok: false, error }` — never throws — so
 * oversized or malformed input cannot exhaust memory or crash the caller.
 */
import { describe, expect, test, } from "bun:test";
import { safeFromBase64, safeToBase64, } from "./base64";
import { DEFAULT_MAX_BASE64_LEN, } from "./constants";

describe("safeToBase64", () => {
  test("encodes a buffer", () => {
    const r = safeToBase64(Buffer.from("hello",),);
    expect(r.ok,).toBe(true,);
    expect(r.ok && r.buffer,).toBe("aGVsbG8=",);
  });

  test("rejects a buffer over maxSize", () => {
    const r = safeToBase64(Buffer.alloc(10,), 3,);
    expect(r.ok,).toBe(false,);
    expect(!r.ok && r.error.message,).toMatch(/too large/,);
  });
});

describe("safeFromBase64", () => {
  test("decodes valid input", () => {
    const r = safeFromBase64("aGVsbG8=",);
    expect(r.ok,).toBe(true,);
    expect(r.ok && r.buffer.toString(),).toBe("hello",);
  });

  test("rejects empty input", () => {
    const r = safeFromBase64("",);
    expect(r.ok,).toBe(false,);
    expect(!r.ok && r.error.message,).toMatch(/Empty/,);
  });

  test("rejects input over the encoded-length cap", () => {
    const r = safeFromBase64("x".repeat(DEFAULT_MAX_BASE64_LEN + 1,),);
    expect(r.ok,).toBe(false,);
    expect(!r.ok && r.error.message,).toMatch(/too large/,);
  });

  test("rejects malformed base64 without throwing", () => {
    const r = safeFromBase64("!!!not-base64!!!",);
    expect(r.ok,).toBe(false,);
    expect(!r.ok && r.error,).toBeInstanceOf(Error,);
  });

  test("rejects decoded output over maxSize", () => {
    const encoded = Buffer.from("hello world",).toString("base64",);
    const r = safeFromBase64(encoded, 3,);
    expect(r.ok,).toBe(false,);
    expect(!r.ok && r.error.message,).toMatch(/too large/,);
  });
});
