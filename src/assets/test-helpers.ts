// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Minimal image buffer factories for unit tests.
 *
 * Each function returns a valid binary buffer with correct headers
 * so extractImageMetadata() can parse dimensions and format.
 * No external dependencies — hand-crafted binary structures.
 */

import { readFileSync, } from "node:fs";
import { join, } from "node:path";

// ── PNG ────────────────────────────────────────────────────────

/**
 * Build a minimal valid PNG buffer with correct IHDR dimensions.
 *
 * Structure: signature(8) + IHDR chunk(25) + IEND chunk(12)
 * @param width
 * @param height
 */
export function makeMinimalPng(width = 2, height = 1,): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
  // IHDR: 4 len + 4 type + 13 data + 4 CRC = 25 bytes
  const ihdr = Buffer.alloc(25,);
  ihdr.writeUInt32BE(13, 0,); // chunk length = 13
  ihdr.write("IHDR", 4, "ascii",);
  ihdr.writeUInt32BE(width, 8,);
  ihdr.writeUInt32BE(height, 12,);
  ihdr[16] = 8; // bit depth
  ihdr[17] = 2; // color type (RGB)
  ihdr[18] = 0; // compression
  ihdr[19] = 0; // filter
  ihdr[20] = 0; // interlace
  // CRC over type+data (bytes 4..24) — dummy zero is fine for tests
  ihdr.writeUInt32BE(0, 21,);

  // IEND: 4 len(0) + 4 type + 4 CRC = 12 bytes
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,],);

  return Buffer.concat([sig, ihdr, iend,],);
}

/**
 * Build a minimal valid PNG with a tEXt caption chunk.
 *
 * Structure: signature + IHDR + tEXt("Description\0{caption}") + IEND
 * @param caption
 * @param width
 * @param height
 */
export function makeMinimalPngWithCaption(
  caption: string,
  width = 2,
  height = 1,
): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);

  const ihdr = Buffer.alloc(25,);
  ihdr.writeUInt32BE(13, 0,);
  ihdr.write("IHDR", 4, "ascii",);
  ihdr.writeUInt32BE(width, 8,);
  ihdr.writeUInt32BE(height, 12,);
  ihdr[16] = 8;
  ihdr[17] = 2;
  ihdr.writeUInt32BE(0, 21,);

  // tEXt chunk: key + null separator + value
  const key = "Description";
  const keyBuf = Buffer.from(key, "ascii",);
  const valBuf = Buffer.from(caption, "utf8",);
  const chunkData = Buffer.concat([keyBuf, Buffer.from([0,],), valBuf,],);
  const tEXt = Buffer.alloc(4 + 4 + chunkData.length + 4,);
  tEXt.writeUInt32BE(chunkData.length, 0,);
  tEXt.write("tEXt", 4, "ascii",);
  chunkData.copy(tEXt, 8,);
  tEXt.writeUInt32BE(0, 8 + chunkData.length,); // dummy CRC

  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,],);

  return Buffer.concat([sig, ihdr, tEXt, iend,],);
}

// ── JPEG ───────────────────────────────────────────────────────

/**
 * Build a minimal valid JPEG buffer with SOF0 dimensions.
 *
 * Structure: SOI + APP0 + SOF0(width, height)
 * @param width
 * @param height
 */
export function makeMinimalJpeg(width = 3, height = 4,): Buffer {
  const soi = Buffer.from([0xFF, 0xD8,],);
  // APP0 marker: FF E0 + length(16) + "JFIF\0" + version + density
  const app0 = Buffer.alloc(18,);
  app0[0] = 0xFF;
  app0[1] = 0xE0;
  app0.writeUInt16BE(16, 2,);
  app0.write("JFIF\0", 4, "ascii",);
  app0[9] = 1; // version major
  app0[10] = 2; // version minor
  app0[11] = 0; // units
  app0.writeUInt16BE(1, 12,); // X density
  app0.writeUInt16BE(1, 14,); // Y density
  app0[16] = 0; // X thumbnail
  app0[17] = 0; // Y thumbnail

  // SOF0 marker: FF C0 + length(17) + precision(8) + height + width + components
  const sof0 = Buffer.alloc(19,);
  sof0[0] = 0xFF;
  sof0[1] = 0xC0;
  sof0.writeUInt16BE(17, 2,);
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5,);
  sof0.writeUInt16BE(width, 7,);
  sof0[9] = 3; // number of components
  // Component 1: ID=1, sampling=0x22, quant=0
  sof0[10] = 1;
  sof0[11] = 0x22;
  sof0[12] = 0;
  // Component 2: ID=2, sampling=0x11, quant=0
  sof0[13] = 2;
  sof0[14] = 0x11;
  sof0[15] = 0;
  // Component 3: ID=3, sampling=0x11, quant=0
  sof0[16] = 3;
  sof0[17] = 0x11;
  sof0[18] = 0;

  return Buffer.concat([soi, app0, sof0,],);
}

/**
 * Build a minimal valid JPEG with a COM (comment) caption.
 *
 * Structure: SOI + APP0 + COM(caption) + SOF0
 * @param caption
 * @param width
 * @param height
 */
export function makeMinimalJpegWithCaption(
  caption: string,
  width = 3,
  height = 4,
): Buffer {
  const soi = Buffer.from([0xFF, 0xD8,],);
  const app0 = Buffer.alloc(18,);
  app0[0] = 0xFF;
  app0[1] = 0xE0;
  app0.writeUInt16BE(16, 2,);
  app0.write("JFIF\0", 4, "ascii",);
  app0[9] = 1;
  app0[10] = 2;
  app0[11] = 0;
  app0.writeUInt16BE(1, 12,);
  app0.writeUInt16BE(1, 14,);
  app0[16] = 0;
  app0[17] = 0;

  // COM marker: FF FE + length + comment data
  const commentBuf = Buffer.from(caption, "utf8",);
  const comLen = 2 + commentBuf.length; // length includes the 2 length bytes themselves
  const com = Buffer.alloc(2 + comLen,);
  com[0] = 0xFF;
  com[1] = 0xFE;
  com.writeUInt16BE(comLen, 2,);
  commentBuf.copy(com, 4,);

  const sof0 = Buffer.alloc(19,);
  sof0[0] = 0xFF;
  sof0[1] = 0xC0;
  sof0.writeUInt16BE(17, 2,);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5,);
  sof0.writeUInt16BE(width, 7,);
  sof0[9] = 3;
  sof0[10] = 1;
  sof0[11] = 0x22;
  sof0[12] = 0;
  sof0[13] = 2;
  sof0[14] = 0x11;
  sof0[15] = 0;
  sof0[16] = 3;
  sof0[17] = 0x11;
  sof0[18] = 0;

  return Buffer.concat([soi, app0, com, sof0,],);
}

// ── WebP ───────────────────────────────────────────────────────

/**
 * Build a minimal valid WebP buffer with VP8 keyframe dimensions.
 *
 * Structure: RIFF(12) + VP8 chunk(14 pad + 2w + 2h + 2 rest)
 * @param width
 * @param height
 */
export function makeMinimalWebp(width = 5, height = 6,): Buffer {
  const riff = Buffer.from([0x52, 0x49, 0x46, 0x46,],); // "RIFF"
  const fileLen = Buffer.alloc(4,);
  fileLen.writeUInt32LE(28, 0,); // total after RIFF: 4 WEBP + 8 VP8 header + 14 VP8 data
  const webp = Buffer.from([0x57, 0x45, 0x42, 0x50,],); // "WEBP"
  const vp8 = Buffer.from([0x56, 0x50, 0x38, 0x20,],); // "VP8 "
  const csize = Buffer.alloc(4,);
  csize.writeUInt32LE(14, 0,); // chunk data size

  // VP8 keyframe data: 6 pad bytes + width(LE 14-bit) + height(LE 14-bit) + 2 rest
  const data = Buffer.alloc(14,);
  data.writeUInt16LE(width & 0x3F_FF, 6,);
  data.writeUInt16LE(height & 0x3F_FF, 8,);

  return Buffer.concat([riff, fileLen, webp, vp8, csize, data,],);
}

// ── Fixture loader ─────────────────────────────────────────────

/**
 * Load a real image fixture from test-fixtures/images/ directory.
 * Returns null if file not found.
 * @param name
 */
export function loadFixture(name: string,): Buffer | null {
  try {
    return readFileSync(join(import.meta.dir, "../../test-fixtures/images", name,),);
  } catch {
    return null;
  }
}
