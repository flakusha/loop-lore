/**
 * Tests for assets/metadata.ts — image metadata extraction from binary headers
 */

import { describe, expect, test } from "bun:test";
import { extractImageMetadata } from "./metadata";

describe("extractImageMetadata", () => {
  describe("PNG", () => {
    test("extracts width and height from PNG header", () => {
      const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const len = new Uint8Array([0, 0, 0, 13]);
      const type = new Uint8Array([73, 72, 68, 82]); // IHDR
      const width = new Uint8Array([0, 0, 1, 0]); // 256 BE
      const height = new Uint8Array([0, 0, 0, 200]); // 200 BE
      const rest = new Uint8Array([8, 2, 0, 0, 0]);
      const crc = new Uint8Array([0, 0, 0, 0]);
      const iend = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);

      const buf = new Uint8Array([...sig, ...len, ...type, ...width, ...height, ...rest, ...crc, ...iend]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("png");
      expect(result.width).toBe(256);
      expect(result.height).toBe(200);
    });

    test("returns unknown for truncated PNG", () => {
      const buf = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBeDefined();
    });
  });

  describe("JPEG", () => {
    test("extracts width and height from JPEG header", () => {
      const soi = new Uint8Array([0xff, 0xd8]);
      const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
      const sof0 = new Uint8Array([
        0xff,
        0xc0,
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
      ]);

      const buf = new Uint8Array([...soi, ...app0, ...sof0]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("jpeg");
      expect(result.width).toBe(150);
      expect(result.height).toBe(100);
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
      ]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("webp");
    });

    test("extracts VP8 keyframe dimensions (parser reads width at offset+14)", () => {
      // VP8 layout: chunkTag(4) + chunkSize(4) + chunkData
      // Parser reads width at offset+14, height at offset+16
      // where offset=12 (start of "VP8 " tag).
      // Data layout: [tag:4][size:4][pad6:6][width:2][height:2][pad:rest]

      const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"
      const fileLen = new Uint8Array([0x1c, 0x00, 0x00, 0x00]); // 28 LE
      const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50]); // "WEBP"
      const vp8 = new Uint8Array([0x56, 0x50, 0x38, 0x20]); // "VP8 "
      const csize = new Uint8Array([0x0e, 0x00, 0x00, 0x00]); // chunkSize=14 LE

      // 6 pad bytes so width lands at offset+14 (byte 26)
      const pad6 = new Uint8Array([0, 0, 0, 0, 0, 0]);
      // width at byte 26-27 (offset+14): 320 = 0x0140, LE = [0x40, 0x01]
      const wh = new Uint8Array([0x40, 0x01]); // width=320
      // height at byte 28-29 (offset+16): 200 = 0x00C8, LE = [0xC8, 0x00]
      const ht = new Uint8Array([0xc8, 0x00]);
      const rest = new Uint8Array([0, 0]); // fill to chunkSize=14

      const buf = new Uint8Array([
        ...riff,
        ...fileLen,
        ...webp,
        ...vp8,
        ...csize,
        ...pad6,
        ...wh,
        ...ht,
        ...rest,
      ]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("webp");
      expect(result.width).toBe(320);
      expect(result.height).toBe(200);
    });

    test("extracts VP8L lossless dimensions (parser reads bits at offset+12)", () => {
      // VP8L: offset=12, reads from offset+12 = byte 24
      // width-1=319, height-1=199 packed: (199<<14)|319 = 0x31FC3F
      // LE bytes: [0x3F, 0xFC, 0x31, 0x00]

      const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      const fileLen = new Uint8Array([0x1c, 0x00, 0x00, 0x00]); // 28
      const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
      const vp8l = new Uint8Array([0x56, 0x50, 0x38, 0x4c]); // "VP8L"
      const csize = new Uint8Array([0x0e, 0x00, 0x00, 0x00]); // 14

      // 4 pad bytes so bits land at offset+12 (byte 24)
      const pad4 = new Uint8Array([0, 0, 0, 0]);
      // bits at byte 24-27: width=320, height=200
      // width-1=319=0x013F, height-1=199=0x00C7
      // packed: (199<<14)|319 = 0x31C13F, LE: [0x3F, 0xC1, 0x31, 0x00]
      const bits = new Uint8Array([0x3f, 0xc1, 0x31, 0x00]);
      const rest = new Uint8Array([0, 0, 0, 0, 0, 0]); // fill to 14

      const buf = new Uint8Array([
        ...riff,
        ...fileLen,
        ...webp,
        ...vp8l,
        ...csize,
        ...pad4,
        ...bits,
        ...rest,
      ]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("webp");
      // width = (bits & 0x3FFF) + 1 = (0x013F) + 1 = 320
      // height = ((bits >> 14) & 0x3FFF) + 1 = (0x00C7) + 1 = 200
      expect(result.width).toBe(320);
      expect(result.height).toBe(200);
    });
  });

  describe("GIF", () => {
    test("extracts dimensions from GIF87a", () => {
      const header = new TextEncoder().encode("GIF87a");
      const buf = new Uint8Array([...header, 0x40, 0x01, 0xf4, 0x01, 0, 0, 0]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("gif");
      expect(result.width).toBe(320);
      expect(result.height).toBe(500);
    });

    test("extracts dimensions from GIF89a", () => {
      const header = new TextEncoder().encode("GIF89a");
      const buf = new Uint8Array([...header, 10, 0, 20, 0, 0, 0, 0]);
      const result = extractImageMetadata(buf);
      expect(result.format).toBe("gif");
      expect(result.width).toBe(10);
      expect(result.height).toBe(20);
    });
  });

  describe("edge cases", () => {
    test("empty buffer returns unknown", () => {
      const result = extractImageMetadata(new Uint8Array([]));
      expect(result.format).toBe("unknown");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    test("random bytes return unknown without crash", () => {
      const result = extractImageMetadata(new Uint8Array([1, 2, 3, 4, 5]));
      expect(result.format).toBe("unknown");
    });

    test("small buffer returns unknown", () => {
      const result = extractImageMetadata(new Uint8Array([0xff]));
      expect(result.format).toBe("unknown");
    });
  });
});
