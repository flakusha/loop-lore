// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/metadata.ts — JPEG COM caption, JPEG SOF fallthrough,
 * WebP short buffer, WebP chunk-skip paths, PNG tEXt/zTXt, and GIF truncation.
 */

import { describe, expect, test } from "bun:test";
import { extractImageMetadata } from "./metadata";
import { makeMinimalJpegWithCaption, makeMinimalPngWithCaption, makeMinimalWebp } from "./test-helpers";

describe("extractImageMetadata — JPEG COM caption", () => {
  test("extracts caption from a COM marker before SOF0", () => {
    const buf = makeMinimalJpegWithCaption("My holiday photo", 100, 200);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("jpeg");
    expect(result.caption).toBe("My holiday photo");
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
  });

  test("COM marker with segLen < 3 leaves caption undefined", () => {
    const soi = new Uint8Array([0xFF, 0xD8]);
    const com = new Uint8Array([0xFF, 0xFE, 0x00, 0x02]);
    const sof0 = new Uint8Array([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x32, 0x00, 0x50, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
    const buf = new Uint8Array([...soi, ...com, ...sof0]);
    const result = extractImageMetadata(buf);
    expect(result.caption).toBeUndefined();
    expect(result.width).toBe(80);
    expect(result.height).toBe(50);
  });

  test("DHT marker (0xC4) before SOF causes loop to skip and return 0x0", () => {
    const soi = new Uint8Array([0xFF, 0xD8]);
    const dht = new Uint8Array([0xFF, 0xC4, 0x00, 0x10]);
    const end = new Uint8Array([0xFF, 0xD9]);
    const buf = new Uint8Array([...soi, ...dht, ...end]);
    const result = extractImageMetadata(buf);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("extractImageMetadata — JPEG truncated SOF", () => {
  test("SOF present but buf too short for segment data returns 0x0", () => {
    const soi = new Uint8Array([0xFF, 0xD8]);
    const sof0_partial = new Uint8Array([0xFF, 0xC0, 0x00, 0x08]);
    const buf = new Uint8Array([...soi, ...sof0_partial]);
    const result = extractImageMetadata(buf);
    expect(result.format).toBe("jpeg");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("extractImageMetadata — WebP short buffer and chunk skip", () => {
  test("WebP buffer shorter than 20 bytes returns 0x0", () => {
    const buf = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("webp");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  test("extracts VP8 dimensions from a clean WebP", () => {
    const buf = makeMinimalWebp(5, 6);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("webp");
    expect(result.width).toBe(5);
    expect(result.height).toBe(6);
  });

  // The chunk-skip loop exits when it encounters a chunk tag it does not
  // recognise (VP8, VP8L, VP8X, EXIF, XMP, ALPH).  An unknown chunk therefore
  // causes the loop to break early and the VP8 frame that follows is never
  // reached, so width/height remain 0.  This documents the current behaviour.
  test("unknown chunk before VP8 causes loop to break and return 0x0", () => {
    const base = makeMinimalWebp(5, 6);
    const riff_webp = base.subarray(0, 12);
    const vp8_part  = base.subarray(12);
    const unknownChunk = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
    const fileLen = Buffer.alloc(4);
    fileLen.writeUInt32LE(38, 0);
    const buf = Buffer.concat([riff_webp, fileLen, unknownChunk, vp8_part]);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("webp");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  test("WebP chunk with size===0 causes loop to break and return 0x0", () => {
    const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const fileLen = new Uint8Array([0x10, 0x00, 0x00, 0x00]);
    const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
    const zeroChunk = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x00, 0x00, 0x00, 0x00]);
    const buf = new Uint8Array([...riff, ...fileLen, ...webp, ...zeroChunk]);
    const result = extractImageMetadata(buf);
    expect(result.format).toBe("webp");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("extractImageMetadata — PNG tEXt/zTXt caption", () => {
  test("extracts Description from tEXt chunk", () => {
    const buf = makeMinimalPngWithCaption("A beautiful sunset", 10, 20);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("png");
    expect(result.width).toBe(10);
    expect(result.height).toBe(20);
    expect(result.caption).toBe("A beautiful sunset");
  });

  test("tEXt with Comment key also extracts caption", () => {
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write("IHDR", 4, "ascii");
    ihdr.writeUInt32BE(5, 8);
    ihdr.writeUInt32BE(5, 12);
    ihdr[16] = 8; ihdr[17] = 2;
    const keyBuf = Buffer.from("Comment", "ascii");
    const valBuf = Buffer.from("This is a comment", "utf8");
    const chunkData = Buffer.concat([keyBuf, Buffer.from([0]), valBuf]);
    const tEXt = Buffer.alloc(4 + 4 + chunkData.length + 4);
    tEXt.writeUInt32BE(chunkData.length, 0);
    tEXt.write("tEXt", 4, "ascii");
    chunkData.copy(tEXt, 8);
    const iend = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
    const buf = Buffer.concat([sig, ihdr, tEXt, iend]);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.caption).toBe("This is a comment");
  });
});

describe("extractImageMetadata — GIF truncation", () => {
  test("GIF with only the 6-byte header returns 0x0", () => {
    const header = new TextEncoder().encode("GIF89a");
    const buf = new Uint8Array([...header, 0x00, 0x00, 0x00, 0x00]);
    const result = extractImageMetadata(new Uint8Array(buf));
    expect(result.format).toBe("gif");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
