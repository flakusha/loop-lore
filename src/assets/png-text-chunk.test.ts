// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for PNG tEXt/zTXt chunk decoding.
 *
 * Buffers are built inline: keyword + null separator + value bytes.
 */
import { describe, expect, test, } from "bun:test";
import { decodeTextChunk, ZTXTSIG, } from "./png-text-chunk";

const TEXTSIG = 0x74_45_58_74; // 'tEXt' in big-endian

function chunkBytes(parts: (string | number)[],): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") { out.push(...Array.from(p, (c,) => c.charCodeAt(0,),),); }
    else { out.push(p,); }
  }
  return new Uint8Array(out,);
}

describe("decodeTextChunk", () => {
  test("tEXt splits key and value on the null separator", () => {
    const buf = chunkBytes(["Title", 0, "Hello",],);
    expect(decodeTextChunk(buf, TEXTSIG, 0, buf.length,),).toEqual({
      key: "Title",
      value: "Hello",
    },);
  });

  test("null on empty value", () => {
    const buf = chunkBytes(["K", 0,],);
    expect(decodeTextChunk(buf, TEXTSIG, 0, buf.length,),).toBeNull();
  });

  test("null when no separator exists", () => {
    const buf = chunkBytes(["abc",],);
    expect(decodeTextChunk(buf, TEXTSIG, 0, buf.length,),).toBeNull();
  });

  test("zTXt strips a leading zero compression-method byte", () => {
    const buf = chunkBytes(["Comment", 0, 0, "Hi",],);
    expect(decodeTextChunk(buf, ZTXTSIG, 0, buf.length,),).toEqual({
      key: "Comment",
      value: "Hi",
    },);
  });

  test("zTXt keeps the value when the first byte is nonzero", () => {
    const buf = chunkBytes(["Comment", 0, "Hi",],);
    expect(decodeTextChunk(buf, ZTXTSIG, 0, buf.length,),).toEqual({
      key: "Comment",
      value: "Hi",
    },);
  });

  test("empty key with a value is returned, not dropped", () => {
    const buf = chunkBytes([0, "v",],);
    expect(decodeTextChunk(buf, TEXTSIG, 0, buf.length,),).toEqual({ key: "", value: "v", },);
  });
});
