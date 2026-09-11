// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for content encoding (identity passthrough, roundtrips). */
import { describe, expect, test, } from "bun:test";
import { decodeContent, } from "./decode";
import { encodeContent, } from "./encode";

const TEXT = "The quick brown fox jumps over the lazy dog. ".repeat(20,);

describe("encodeContent", () => {
  test("identity returns the plaintext untouched", () => {
    expect(encodeContent(TEXT, "identity",),).toEqual({ encoded: TEXT, encoding: "identity", },);
  });

  test("empty input short-circuits to identity", () => {
    expect(encodeContent("", "gzip",),).toEqual({ encoded: "", encoding: "identity", },);
  });

  test("roundtrips through every compressed encoding", () => {
    for (const encoding of ["gzip", "zstd", "brotli",] as const) {
      const result = encodeContent(TEXT, encoding,);
      expect(result.encoding,).toBe(encoding,);
      expect(result.encoded,).not.toBe(TEXT,);
      expect(decodeContent(result.encoded, encoding,),).toBe(TEXT,);
    }
  });

  test("roundtrips unicode text", () => {
    const unicode = "héllo wörld 🎲 日本語";
    const result = encodeContent(unicode, "gzip",);
    expect(decodeContent(result.encoded, result.encoding,),).toBe(unicode,);
  });
});
