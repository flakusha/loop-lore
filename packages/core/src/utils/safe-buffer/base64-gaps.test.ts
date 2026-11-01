// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { safeFromBase64, safeToBase64, } from "./base64";
import { DEFAULT_MAX_BASE64_LEN, } from "./constants";

describe("safe-buffer/base64 gaps — decode limits", () => {
  test("empty input fails with Empty error", () => {
    const r = safeFromBase64("",);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error.message,).toBe("Empty base64 input",); }
  });

  test("oversized input fails with too-large error", () => {
    const r = safeFromBase64("A".repeat(DEFAULT_MAX_BASE64_LEN + 1,),);
    expect(r.ok,).toBe(false,);
    if (!r.ok) {
      expect(r.error.message,).toBe(
        `Base64 input too large: ${DEFAULT_MAX_BASE64_LEN + 1} chars`,
      );
    }
  });

  test("decoded buffer over maxSize fails with size error", () => {
    const encoded = Buffer.from([1, 2, 3, 4,],).toString("base64",);
    const r = safeFromBase64(encoded, 2,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) {
      expect(r.error.message,).toBe("Decoded buffer too large: 4 bytes (max: 2)",);
    }
  });

  test("invalid base64 fails with an Error", () => {
    const r = safeFromBase64("!!!not-base64!!!",);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error,).toBeInstanceOf(Error,); }
  });

  test("valid input round-trips to the original bytes", () => {
    const original = Buffer.from([0, 1, 2, 255, 128, 64,],);
    const r = safeFromBase64(original.toString("base64",),);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.buffer.equals(original,),).toBe(true,); }
  });
});

describe("safe-buffer/base64 gaps — encode limits", () => {
  test("buffer over maxSize fails with size error", () => {
    const r = safeToBase64(Buffer.alloc(8,), 4,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) {
      expect(r.error.message,).toBe("Buffer too large to encode: 8 bytes (max: 4)",);
    }
  });

  test("valid buffer encodes to standard base64", () => {
    const r = safeToBase64(Buffer.from("hi",),);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.buffer,).toBe("aGk=",); }
  });
});
