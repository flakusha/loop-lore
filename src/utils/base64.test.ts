// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/utils/base64.ts.
 *
 * Regression: BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0
 *   The previous implementation used `bytes[i] ?? 0` — dead code, since
 *   `Uint8Array.prototype[i]` always returns `number` (never undefined)
 *   when `i < bytes.length`. The `??` operator gave a misleading sense
 *   of safety and would have silently masked any future caller that
 *   supplied a non-numeric accessor. The fix uses `bytes[i]!` so the
 *   TypeScript type system enforces "this is a number" at compile time;
 *   runtime behavior is unchanged for any valid Uint8Array.
 */
import { describe, expect, test, } from "bun:test";
import { fromBase64, toBase64, } from "./base64.ts";

describe("base64 encode/decode", () => {
  test("round-trip: encoding then decoding returns the original bytes", () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32,],);
    expect(fromBase64(toBase64(original,),),).toEqual(original,);
  });

  test("empty array round-trips", () => {
    expect(toBase64(new Uint8Array(0,),),).toBe("",);
    expect(fromBase64("",),).toEqual(new Uint8Array(0,),);
  });

  test("regression: dense bytes are unaffected by the ?? 0 -> ! fix", () => {
    const bytes = new Uint8Array(256,);
    for (let i = 0; i < 256; i++) { bytes[i] = i; }
    expect(fromBase64(toBase64(bytes,),),).toEqual(bytes,);
  });

  test("ASCII 'ABC' encodes to standard base64 'QUJD'", () => {
    expect(toBase64(new Uint8Array([65, 66, 67,],),),).toBe("QUJD",);
    expect(fromBase64("QUJD",),).toEqual(new Uint8Array([65, 66, 67,],),);
  });
});
