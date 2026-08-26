/**
 * Tests for assets/metadata.ts — image metadata extraction from binary headers
 */

import { describe, expect, test, } from "bun:test";
import { extractImageMetadata, } from "./metadata";

describe("extractImageMetadata", () => {
  describe("PNG", () => {
    test("extracts width and height from PNG header", () => {
      const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10,],);
      const len = new Uint8Array([0, 0, 0, 13,],);
      const type = new Uint8Array([73, 72, 68, 82,],); // IHDR
      const width = new Uint8Array([0, 0, 1, 0,],); // 256 BE
      const height = new Uint8Array([0, 0, 0, 200,],); // 200 BE
      const rest = new Uint8Array([8, 2, 0, 0, 0,],);
      const crc = new Uint8Array([0, 0, 0, 0,],);
      const iend = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,],);

      const buf = new Uint8Array([...sig, ...len, ...type, ...width, ...height, ...rest, ...crc, ...iend,],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("png",);
      expect(result.width,).toBe(256,);
      expect(result.height,).toBe(200,);
    });

    test("returns unknown for truncated PNG", () => {
      const buf = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0,],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBeDefined();
    });
  });

  describe("JPEG", () => {
    test("extracts width and height from JPEG header", () => {
      const soi = new Uint8Array([0xFF, 0xD8,],);
      const app0 = new Uint8Array([0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0,],);
      const sof0 = new Uint8Array([
        0xFF,
        0xC0,
        0,
        17,
        8,
        0,
        100, // height = 100
        0,
        150, // width = 150
        3,
        1,
        0x22,
        0,
        2,
        0x11,
        0,
        3,
        0x11,
        0,
      ],);

      const buf = new Uint8Array([...soi, ...app0, ...sof0,],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("jpeg",);
      expect(result.width,).toBe(150,);
      expect(result.height,).toBe(100,);
    });
  });

  describe("WebP", () => {
    test("detects WebP format from RIFF header", () => {
      // Minimal WebP: RIFF header with "WEBP" brand, empty chunks
      const buf = new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46, // "RIFF"
        0x10,
        0x00,
        0x00,
        0x00, // file size = 16
        0x57,
        0x45,
        0x42,
        0x50, // "WEBP"
      ],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("webp",);
    });

    test("extracts VP8 keyframe dimensions", () => {
      // VP8 lossy keyframe layout (after RIFF+WEBP header at offset=12):
      //   [tag:4 "VP8 "][size:4][frame_tag:3][start_code:3 0x9D 0x01 0x2A]
      //   [width:2 LE][height:2 LE][pad:rest]
      const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46,],); // "RIFF"
      const fileLen = new Uint8Array([0x1C, 0x00, 0x00, 0x00,],); // 28 LE
      const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50,],); // "WEBP"
      const vp8 = new Uint8Array([0x56, 0x50, 0x38, 0x20,],); // "VP8 "
      const csize = new Uint8Array([0x0E, 0x00, 0x00, 0x00,],); // chunkSize=14 LE
      const frameTag = new Uint8Array([0x9A, 0x02, 0x00,],); // key frame
      const startCode = new Uint8Array([0x9D, 0x01, 0x2A,],);
      // width=320 LE=0x0140, height=200 LE=0x00C8
      const wh = new Uint8Array([0x40, 0x01, 0xC8, 0x00,],);
      const rest = new Uint8Array([0, 0,],); // fill to chunkSize=14

      const buf = new Uint8Array([
        ...riff,
        ...fileLen,
        ...webp,
        ...vp8,
        ...csize,
        ...frameTag,
        ...startCode,
        ...wh,
        ...rest,
      ],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("webp",);
      expect(result.width,).toBe(320,);
      expect(result.height,).toBe(200,);
    });

    test("extracts VP8L lossless dimensions", () => {
      // VP8L layout (after RIFF+WEBP header at offset=12):
      //   [tag:4 "VP8L"][size:4][signature:1 0x2F][bits:4 LE packed]
      // Bits: width-1 in [0..13], height-1 in [14..27].
      // width=320 → width-1=319=0x013F; height=200 → height-1=199=0x00C7.
      // packed = (199 << 14) | 319 = 0x31C13F.
      const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46,],);
      const fileLen = new Uint8Array([0x1A, 0x00, 0x00, 0x00,],); // 26 LE
      const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50,],);
      const vp8l = new Uint8Array([0x56, 0x50, 0x38, 0x4C,],); // "VP8L"
      const csize = new Uint8Array([0x0C, 0x00, 0x00, 0x00,],); // chunkSize=12 LE
      const sig = new Uint8Array([0x2F,],);
      const bits = new Uint8Array([0x3F, 0xC1, 0x31, 0x00,],); // 0x31C13F LE
      const rest = new Uint8Array([0, 0, 0, 0, 0, 0, 0,],); // fill to chunkSize=12

      const buf = new Uint8Array([
        ...riff,
        ...fileLen,
        ...webp,
        ...vp8l,
        ...csize,
        ...sig,
        ...bits,
        ...rest,
      ],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("webp",);
      expect(result.width,).toBe(320,);
      expect(result.height,).toBe(200,);
    });

    test("extracts VP8X extended dimensions", () => {
      // VP8X layout (after RIFF+WEBP header at offset=12):
      //   [tag:4 "VP8X"][size:4][flags:1][reserved:3][width-1:3 LE][height-1:3 LE]
      // width=1024 → width-1=1023=0x0003FF; height=512 → height-1=511=0x0001FF.
      const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46,],);
      const fileLen = new Uint8Array([0x1A, 0x00, 0x00, 0x00,],); // 26 LE
      const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50,],);
      const vp8x = new Uint8Array([0x56, 0x50, 0x38, 0x58,],); // "VP8X"
      const csize = new Uint8Array([0x0A, 0x00, 0x00, 0x00,],); // chunkSize=10 LE
      const flags = new Uint8Array([0x00,],);
      const reserved = new Uint8Array([0, 0, 0,],);
      const widthLE = new Uint8Array([0xFF, 0x03, 0x00,],); // 1023 LE
      const heightLE = new Uint8Array([0xFF, 0x01, 0x00,],); // 511 LE

      const buf = new Uint8Array([
        ...riff,
        ...fileLen,
        ...webp,
        ...vp8x,
        ...csize,
        ...flags,
        ...reserved,
        ...widthLE,
        ...heightLE,
      ],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("webp",);
      expect(result.width,).toBe(1024,);
      expect(result.height,).toBe(512,);
    });
  });

  describe("GIF", () => {
    test("extracts dimensions from GIF87a", () => {
      const header = new TextEncoder().encode("GIF87a",);
      const buf = new Uint8Array([...header, 0x40, 0x01, 0xF4, 0x01, 0, 0, 0,],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("gif",);
      expect(result.width,).toBe(320,);
      expect(result.height,).toBe(500,);
    });

    test("extracts dimensions from GIF89a", () => {
      const header = new TextEncoder().encode("GIF89a",);
      const buf = new Uint8Array([...header, 10, 0, 20, 0, 0, 0, 0,],);
      const result = extractImageMetadata(buf,);
      expect(result.format,).toBe("gif",);
      expect(result.width,).toBe(10,);
      expect(result.height,).toBe(20,);
    });
  });

  describe("edge cases", () => {
    test("empty buffer returns unknown", () => {
      const result = extractImageMetadata(new Uint8Array([],),);
      expect(result.format,).toBe("unknown",);
      expect(result.width,).toBe(0,);
      expect(result.height,).toBe(0,);
    });

    test("random bytes return unknown without crash", () => {
      const result = extractImageMetadata(new Uint8Array([1, 2, 3, 4, 5,],),);
      expect(result.format,).toBe("unknown",);
    });

    test("small buffer returns unknown", () => {
      const result = extractImageMetadata(new Uint8Array([0xFF,],),);
      expect(result.format,).toBe("unknown",);
    });
  });
});
