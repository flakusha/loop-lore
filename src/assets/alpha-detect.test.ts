// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for header-level alpha detection (PNG / WebP / GIF).
 *
 * Buffers are hand-built to the minimum shape each probe reads — no image
 * fixtures, no decoder. Short/empty inputs must return false, never throw.
 */
import { describe, expect, test, } from "bun:test";
import { detectGifAlpha, detectPngAlpha, detectWebpAlpha, } from "./alpha-detect";

/** Minimal PNG: 33-byte header with a chosen color type, plus extra chunks. */
function png(colorType: number, extra: number[] = [],): Uint8Array {
  const buf = new Uint8Array(33 + extra.length,);
  buf[25] = colorType;
  buf.set(extra, 33,);
  return buf;
}

/**
 * A PNG chunk (length + type + payload + CRC). Full length matters: the
 * probe loop requires `offset + 8 < buf.length` to inspect a chunk.
 */
function chunk(type: string, length = 0,): number[] {
  return [
    0,
    0,
    0,
    length,
    ...Array.from(type, (c,) => c.charCodeAt(0,),),
    ...new Array<number>(length,).fill(7,),
    0,
    0,
    0,
    0,
  ];
}

/** Minimal WebP: RIFF header plus a list of (tag, payload) chunks. */
function webp(chunks: { tag: string; payload: number[] }[],): Uint8Array {
  const out: number[] = [
    0x52,
    0x49,
    0x46,
    0x46,
    0,
    0,
    0,
    0,
    0x57,
    0x45,
    0x42,
    0x50,
  ];
  for (const { tag, payload, } of chunks) {
    out.push(...Array.from(tag, (c,) => c.charCodeAt(0,),),);
    const size = payload.length;
    out.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff,);
    out.push(...payload,);
    if (size % 2 !== 0) { out.push(0,); }
  }
  return new Uint8Array(out,);
}

/** Minimal GIF: header + screen descriptor, then extension bytes. */
function gif(packed: number, rest: number[],): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // GIF89a
    1,
    0,
    1,
    0,
    packed,
    0,
    0, // logical screen descriptor
    ...rest,
  ],);
}

describe("detectPngAlpha", () => {
  test("true for alpha color types (4 and 6)", () => {
    expect(detectPngAlpha(png(6,),),).toBe(true,);
    expect(detectPngAlpha(png(4,),),).toBe(true,);
  });

  test("false for opaque color type without tRNS", () => {
    expect(detectPngAlpha(png(2,),),).toBe(false,);
  });

  test("true when a tRNS chunk follows", () => {
    expect(detectPngAlpha(png(2, chunk("tRNS", 3,),),),).toBe(true,);
  });

  test("false when IEND precedes any tRNS", () => {
    expect(detectPngAlpha(png(2, [...chunk("IEND",), ...chunk("tRNS", 3,),],),),).toBe(false,);
  });

  test("walks past unrelated chunks to a later tRNS", () => {
    expect(detectPngAlpha(png(2, [...chunk("zTXt", 5,), ...chunk("tRNS", 3,),],),),).toBe(true,);
  });

  test("false (no throw) on empty input", () => {
    expect(detectPngAlpha(new Uint8Array(0,),),).toBe(false,);
  });
});

describe("detectWebpAlpha", () => {
  test("VP8X flag bit decides", () => {
    expect(detectWebpAlpha(webp([{ tag: "VP8X", payload: [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0,], },],),),).toBe(
      true,
    );
    expect(detectWebpAlpha(webp([{ tag: "VP8X", payload: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0,], },],),),).toBe(
      false,
    );
  });

  test("VP8L means alpha, lossy VP8 means none", () => {
    expect(detectWebpAlpha(webp([{ tag: "VP8L", payload: [1, 2, 3, 4,], },],),),).toBe(true,);
    expect(detectWebpAlpha(webp([{ tag: "VP8 ", payload: [1, 2, 3, 4,], },],),),).toBe(false,);
  });

  test("skips unknown chunks to reach the verdict", () => {
    const buf = webp([
      { tag: "ICCP", payload: [9, 9, 9, 9,], },
      { tag: "VP8L", payload: [1,], },
    ],);
    expect(detectWebpAlpha(buf,),).toBe(true,);
  });

  test("zero-size chunk stops the scan", () => {
    expect(detectWebpAlpha(webp([{ tag: "ICCP", payload: [], },],),),).toBe(false,);
  });

  test("false (no throw) on empty input", () => {
    expect(detectWebpAlpha(new Uint8Array(0,),),).toBe(false,);
  });
});

describe("detectGifAlpha", () => {
  test("graphic-control transparency flag decides", () => {
    expect(detectGifAlpha(gif(0, [0x21, 0xf9, 0x04, 0x01,],),),).toBe(true,);
    expect(detectGifAlpha(gif(0, [0x21, 0xf9, 0x04, 0x00,],),),).toBe(false,);
  });

  test("skips the global color table when flagged", () => {
    // Packed 0x80: GCT present, size 3 * 2^(0+1) = 6 bytes.
    const gct = [7, 7, 7, 7, 7, 7,];
    expect(detectGifAlpha(gif(0x80, [...gct, 0x21, 0xf9, 0x04, 0x01,],),),).toBe(true,);
  });

  test("false on immediate trailer", () => {
    expect(detectGifAlpha(gif(0, [0x3b,],),),).toBe(false,);
  });

  test("skips non-GCE extensions to reach the verdict", () => {
    // Plain-text extension (0x21 0x01) with sub-blocks, then a GCE.
    const rest = [0x21, 0x01, 0x03, 0x61, 0x62, 0x63, 0x00, 0x21, 0xf9, 0x04, 0x01,];
    expect(detectGifAlpha(gif(0, rest,),),).toBe(true,);
  });

  test("skips image descriptors, with and without local color table", () => {
    const gce = [0x21, 0xf9, 0x04, 0x01,];
    const noLct = [0x2c, 1, 2, 3, 4, 5, 6, 7, 8, 0x00, 0x02, 0x03, 0x61, 0x62, 0x63, 0x00, ...gce,];
    expect(detectGifAlpha(gif(0, noLct,),),).toBe(true,);
    const lct = [0x2c, 1, 2, 3, 4, 5, 6, 7, 8, 0x80, 9, 9, 9, 9, 9, 9, 0x02, 0x00, ...gce,];
    expect(detectGifAlpha(gif(0, lct,),),).toBe(true,);
  });

  test("steps over unknown bytes", () => {
    expect(detectGifAlpha(gif(0, [0x00, 0x21, 0xf9, 0x04, 0x01,],),),).toBe(true,);
  });

  test("false (no throw) on empty input", () => {
    expect(detectGifAlpha(new Uint8Array(0,),),).toBe(false,);
  });
});
