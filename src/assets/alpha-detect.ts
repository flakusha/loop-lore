// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Header-level alpha detection for image buffers.
 *
 * Reads binary headers only (no full decode): PNG color type + tRNS chunk,
 * WebP VP8X ALPH flag (VP8L assumed alpha-capable), GIF graphic-control
 * transparency flag. JPEG has no alpha.
 */

const TRNSSIG = 0x74_52_4E_53; // 'tRNS' in big-endian

/**
 * @param buf
 * @param offset
 */
function readUint32BE(buf: Uint8Array, offset: number,): number {
  return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
}

/**
 * @param buf
 * @param offset
 */
function readUint32LE(buf: Uint8Array, offset: number,): number {
  return ((buf[offset + 3]! << 24) | (buf[offset + 2]! << 16) | (buf[offset + 1]! << 8) | buf[offset]!) >>> 0;
}

/**
 * PNG: color type 4 (grayscale+alpha) or 6 (RGBA), or any tRNS chunk.
 * @param buf
 */
export function detectPngAlpha(buf: Uint8Array,): boolean {
  // IHDR: byte 25 (data offset 9) is color type
  const colorType = buf[25]!;
  if (colorType === 4 || colorType === 6) { return true; }

  let offset = 33; // after IHDR chunk (8 sig + 4 len + 4 type + 13 data + 4 CRC)
  while (offset + 8 < buf.length) {
    const chunkLen = readUint32BE(buf, offset,);
    const chunkType = readUint32BE(buf, offset + 4,);
    if (chunkType === 0x49_45_4E_44) { break; } // IEND
    if (chunkType === TRNSSIG) { return true; }
    offset += 12 + chunkLen;
  }
  return false;
}

/**
 * WebP: VP8X extended flag bit 4 (alpha); VP8L carries alpha in-stream
 * with no cheap header probe — assume present; lossy VP8 has none.
 * @param buf
 */
export function detectWebpAlpha(buf: Uint8Array,): boolean {
  let offset = 12; // first chunk header after RIFF header
  while (offset + 8 <= buf.length) {
    const chunkTag = new TextDecoder().decode(buf.slice(offset, offset + 4,),);
    const chunkSize = readUint32LE(buf, offset + 4,);
    if (chunkTag === "VP8X") {
      const flags = buf[offset + 8]!;
      return (flags & 0x10) !== 0;
    }
    if (chunkTag === "VP8L") { return true; }
    if (chunkTag === "VP8 ") { return false; }
    if (chunkSize === 0) { break; }
    const chunkEnd = offset + 8 + chunkSize;
    offset = chunkEnd % 2 !== 0 ? chunkEnd + 1 : chunkEnd;
  }
  return false;
}

/**
 * GIF: first Graphic Control Extension (0x21 0xF9) packed-field bit 0.
 * @param buf
 */
export function detectGifAlpha(buf: Uint8Array,): boolean {
  // Skip logical screen descriptor; global color table (if flagged) is
  // 3 * 2^(N+1) bytes where N = packed-field low 3 bits.
  const packed = buf[10]!;
  const gctSize = (packed & 0x80) !== 0 ? 3 * (2 << (packed & 0x07)) : 0;
  let offset = 13 + gctSize;
  while (offset + 2 < buf.length) {
    const intro = buf[offset]!;
    if (intro === 0x3B) { break; } // trailer
    if (intro === 0x21 && buf[offset + 1] === 0xF9) {
      return (buf[offset + 3]! & 0x01) !== 0;
    }
    if (intro === 0x21) {
      // Extension: label byte(s) done, now walk length-prefixed sub-blocks
      // through the 0x00 terminator.
      offset += 2;
      while (offset < buf.length) {
        const size = buf[offset]!;
        offset += 1 + size;
        if (size === 0) { break; }
      }
      continue;
    }
    if (intro === 0x2C) {
      // Image descriptor: 9 fixed bytes + optional local color table,
      // then LZW minimum code byte + sub-blocks.
      const lctFlags = buf[offset + 9]!;
      offset += 10;
      if ((lctFlags & 0x80) !== 0) { offset += 3 * (2 << (lctFlags & 0x07)); }
      offset += 1; // LZW minimum code size
      while (offset < buf.length) {
        const size = buf[offset]!;
        offset += 1 + size;
        if (size === 0) { break; }
      }
      continue;
    }
    offset += 1; // unknown byte: step forward instead of guessing a size
  }
  return false;
}
