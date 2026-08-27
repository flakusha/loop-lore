// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for browser-uuid.ts — browser-side UUIDv7 generator (RFC 9562 §5.7).
 */

import { describe, expect, test, } from "bun:test";
import { browserRandomUUIDv7, isUUIDv7, } from "./browser-uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("browserRandomUUIDv7", () => {
  test("matches canonical UUID layout", () => {
    const id = browserRandomUUIDv7();
    expect(id,).toMatch(UUID_RE,);
    expect(id.length,).toBe(36,);
  });

  test("embeds unix-ms timestamp in the high 48 bits", () => {
    // 0x018e_4c5a_7b21 = 1_706_603_066_145 ms (within 48-bit range).
    const ts = 0x018e_4c5a_7b21;
    const id = browserRandomUUIDv7({ timestampMs: ts, },);
    // First 12 hex chars (48 bits) encode the timestamp; position 14 is the version nibble.
    expect(id[14],).toBe("7",);
    const hexNoDashes = id.replace(/-/g, "",);
    const highBits = parseInt(hexNoDashes.slice(0, 12,), 16,);
    expect(highBits,).toBe(ts,);
  });

  test("sets variant bits to 10xx (char 19 ∈ {8,9,a,b})", () => {
    const id = browserRandomUUIDv7();
    const variant = id[19];
    expect(variant === "8" || variant === "9" || variant === "a" || variant === "b",).toBe(true,);
  });

  test("passes isUUIDv7 type guard", () => {
    const id = browserRandomUUIDv7();
    expect(isUUIDv7(id,),).toBe(true,);
  });

  test("isUUIDv7 rejects v4 and non-canonical strings", () => {
    expect(isUUIDv7("00000000-0000-4000-8000-000000000000",),).toBe(false,);
    expect(isUUIDv7("00000000-0000-7000-8000-000000000000",),).toBe(true,);
    expect(isUUIDv7("not-a-uuid",),).toBe(false,);
    expect(isUUIDv7("",),).toBe(false,);
  });

  test("two consecutive calls produce distinct ids", () => {
    const a = browserRandomUUIDv7();
    const b = browserRandomUUIDv7();
    expect(a,).not.toBe(b,);
  });

  test("same-ms calls remain unique", () => {
    const ts = 1_700_000_000_000;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = browserRandomUUIDv7({ timestampMs: ts, },);
      expect(seen.has(id,),).toBe(false,);
      seen.add(id,);
    }
    expect(seen.size,).toBe(100,);
  });

  test("calls with monotonically increasing timestamps are lex-ordered", () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(browserRandomUUIDv7({ timestampMs: 1_700_000_000_000 + i, },),);
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1]! < ids[i]!,).toBe(true,);
    }
  });

  test("uniqueness across 10k samples (no collisions)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = browserRandomUUIDv7();
      expect(seen.has(id,),).toBe(false,);
      seen.add(id,);
    }
    expect(seen.size,).toBe(10_000,);
  });

  test("rejects invalid timestampMs values", () => {
    expect(() => browserRandomUUIDv7({ timestampMs: -1, },)).toThrow(RangeError,);
    expect(() => browserRandomUUIDv7({ timestampMs: 1.5, },)).toThrow(RangeError,);
    expect(() => browserRandomUUIDv7({ timestampMs: Number.NaN, },)).toThrow(RangeError,);
  });

  test("honours a deterministic randomness source", () => {
    const allZeros = <T extends ArrayBufferView,>(buf: T,): T => {
      const view = buf as unknown as Uint8Array;
      for (let i = 0; i < view.length; i++) { view[i] = 0; }
      return buf;
    };
    const id = browserRandomUUIDv7({ timestampMs: 0, random: allZeros, },);
    // With ts=0 + zero bytes + version/variant overrides:
    //   bytes 0..5 = 00       → "000000000000"
    //   byte 6 high nibble=7   → "7"
    //   bytes 6..7  = 70 00    → "7000"
    //   byte 8 high bits=10    → "8"
    //   bytes 8..15 = 80 00... → "8000000000000000"
    // Result: "00000000-0000-7000-8000-000000000000".
    expect(id,).toBe("00000000-0000-7000-8000-000000000000",);
  });
});
