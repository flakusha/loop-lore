// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 279
/**
 * Image metadata extraction from raw file headers.
 * No external dependencies — reads binary headers directly.
 * Supports: PNG, JPEG, WebP, GIF. Alpha detection lives in ./alpha-detect.
 */
import { detectGifAlpha, detectPngAlpha, detectWebpAlpha, } from "./alpha-detect";

/** */
export interface ImageMetadata {
  width: number;
  height: number;
  caption?: string; // extracted from metadata fields
  format: "png" | "jpeg" | "webp" | "gif" | "unknown";
  /** Header-level alpha presence (PNG color type/tRNS, WebP ALPH flag, GIF transparency). */
  hasAlpha: boolean;
}

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10,],);
const TEXTSIG = 0x74_45_58_74; // 'tEXt' in big-endian
const ZTXTSIG = 0x7A_54_58_74; // 'zTXt' in big-endian

/**
 * @param buf
 * @param offset
 */
function readUint16BE(buf: Uint8Array, offset: number,): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

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
function readUint16LE(buf: Uint8Array, offset: number,): number {
  return (buf[offset + 1]! << 8) | buf[offset]!;
}

/**
 * @param buf
 * @param offset
 */
function readUint24LE(buf: Uint8Array, offset: number,): number {
  return (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16)) >>> 0;
}

/**
 * @param buf
 * @param offset
 */
function readUint32LE(buf: Uint8Array, offset: number,): number {
  return ((buf[offset + 3]! << 24) | (buf[offset + 2]! << 16) | (buf[offset + 1]! << 8) | buf[offset]!) >>> 0;
}

/**
 * @param buf
 * @param prefix
 */
function startsWith(buf: Uint8Array, prefix: Uint8Array,): boolean {
  if (buf.length < prefix.length) { return false; }
  for (const [i, byte,] of prefix.entries()) { if (buf[i] !== byte) { return false; } }
  return true;
}

/**
 * @param buf
 */
function parsePngMetadata(buf: Uint8Array,): { width: number; height: number; caption?: string } {
  const width = readUint32BE(buf, 16,);
  const height = readUint32BE(buf, 20,);

  // Scan for tEXt/zTXt chunks for caption
  let offset = 33; // after IHDR chunk (8 sig + 4 len + 4 type + 13 data + 4 CRC)
  let caption: string | undefined;

  while (offset + 8 < buf.length) {
    const chunkLen = readUint32BE(buf, offset,);
    const chunkType = readUint32BE(buf, offset + 4,);

    if (chunkType === 0x49_45_4E_44) { break; // IEND
     }
    if (chunkType === TEXTSIG || chunkType === ZTXTSIG) {
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkLen;
      if (dataEnd <= buf.length) {
        const text = decodeTextChunk(buf, chunkType, dataStart, dataEnd,);
        if (text && !caption && (["Description", "Comment", "Title",] as const).includes(text.key as "Description",)) {
          caption = text.value;
        }
      }
    }

    offset += 12 + chunkLen; // skip chunk (len + type + data + CRC)
  }

  return { width, height, caption, };
}

/**
 * Decode a PNG tEXt/zTXt chunk into its key/value pair (null on empty value).
 * @param buf
 * @param chunkType
 * @param dataStart
 * @param dataEnd
 */
function decodeTextChunk(
  buf: Uint8Array,
  chunkType: number,
  dataStart: number,
  dataEnd: number,
): { key: string; value: string } | null {
  // Find null separator between key and value
  let nullPos = dataStart;
  while (nullPos < dataEnd && buf[nullPos] !== 0) { nullPos++; }
  const key = new TextDecoder().decode(buf.slice(dataStart, nullPos,),);
  const valStart = nullPos + 1;
  if (valStart >= dataEnd) { return null; }
  const value = chunkType === ZTXTSIG && buf[valStart] === 0
    ? new TextDecoder().decode(buf.slice(valStart + 1, dataEnd,),)
    : new TextDecoder().decode(buf.slice(valStart, dataEnd,),);
  return { key, value, };
}
/**
 * @param buf
 */
function parseJpegMetadata(buf: Uint8Array,): { width: number; height: number; caption?: string } {
  let offset = 2;
  let caption: string | undefined;

  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xFF) { break; }
    const marker = buf[offset + 1]!;

    if ([0xD8, 0xD9, 0x00,].includes(marker,)) {
      // SOI, EOI, padding
      offset++;
      continue;
    }

    if (marker === 0xFE) {
      // COM (comment) marker
      const segLen = readUint16BE(buf, offset + 2,);
      if (segLen >= 3) {
        caption = new TextDecoder().decode(buf.slice(offset + 4, offset + 2 + segLen,),);
      }
      offset += 2 + segLen;
      continue;
    }

    // SOF0-SOF15 markers (start of frame) — contains dimensions
    if (
      marker !== 0xC4 &&
      marker !== 0xC8 &&
      marker !== 0xCC &&
      marker >= 0xC0 &&
      marker <= 0xCF &&
      offset + 11 <= buf.length
    ) {
      const height = readUint16BE(buf, offset + 5,);
      const width = readUint16BE(buf, offset + 7,);
      return { width, height, caption, };
    }

    const segLen = readUint16BE(buf, offset + 2,);
    if (segLen < 2) { break; }
    offset += 2 + segLen;
  }

  return { width: 0, height: 0, caption, };
}

/**
 * @param buf
 */
function parseWebpMetadata(buf: Uint8Array,): { width: number; height: number } {
  // RIFF header: 4 bytes "RIFF" + 4 bytes file size + 4 bytes "WEBP"
  // VP8/VP8L/VP8X chunk follows
  if (buf.length < 20) { return { width: 0, height: 0, }; }

  let offset = 12; // Start of chunk header after RIFF header

  while (offset + 8 <= buf.length) {
    const chunkTag = new TextDecoder().decode(buf.slice(offset, offset + 4,),);
    const chunkSize = readUint32LE(buf, offset + 4,);

    if (chunkTag === "VP8 " && chunkSize >= 10) {
      // VP8 keyframe: 3 bytes frame tag + 3 bytes start code (0x9D 0x01 0x2A)
      // + uint16 LE width + uint16 LE height (lower 14 bits each, upper 2 are scale).
      const raw = readUint16LE(buf, offset + 14,);
      const width = raw & 0x3F_FF;
      const height = readUint16LE(buf, offset + 16,) & 0x3F_FF;
      return { width, height, };
    }

    if (chunkTag === "VP8L" && chunkSize >= 5) {
      // VP8L lossless: 1-byte signature 0x2F + 32-bit LE packed (width-1, height-1)
      // Width-1 occupies bits 0..13, height-1 bits 14..27.
      const bits = readUint32LE(buf, offset + 9,);
      const width = (bits & 0x3F_FF) + 1;
      const height = ((bits >> 14) & 0x3F_FF) + 1;
      return { width, height, };
    }

    if (chunkTag === "VP8X") {
      // VP8X extended: 1-byte flags + 3 reserved + 24-bit LE width-1 + 24-bit LE height-1
      const width = readUint24LE(buf, offset + 12,) + 1;
      const height = readUint24LE(buf, offset + 15,) + 1;
      return { width, height, };
    }

    // Check for EXIF chunk (metadata) — skip
    if (chunkSize === 0) { break; }
    const chunkEnd = offset + 8 + chunkSize;
    offset = chunkEnd;
    // Align to even boundary
    if (chunkEnd % 2 !== 0) { offset++; }
  }

  return { width: 0, height: 0, };
}

/**
 * @param buf
 */
function parseGifMetadata(buf: Uint8Array,): { width: number; height: number } {
  const width = readUint16LE(buf, 6,);
  const height = readUint16LE(buf, 8,);
  return { width, height, };
}

/**
 * Extract metadata from an image buffer.
 * Returns dimensions, format, alpha presence, and optional caption.
 * @param buffer
 */
export function extractImageMetadata(buffer: Uint8Array,): ImageMetadata {
  if (startsWith(buffer, PNG_HEADER,)) {
    const { width, height, caption, } = parsePngMetadata(buffer,);
    return { width, height, caption, hasAlpha: detectPngAlpha(buffer,), format: "png", };
  }

  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    const { width, height, caption, } = parseJpegMetadata(buffer,);
    return { width, height, caption, hasAlpha: false, format: "jpeg", };
  }

  if (
    buffer.length >= 12 &&
    new TextDecoder().decode(buffer.slice(0, 4,),) === "RIFF" &&
    new TextDecoder().decode(buffer.slice(8, 12,),) === "WEBP"
  ) {
    const { width, height, } = parseWebpMetadata(buffer,);
    return { width, height, hasAlpha: detectWebpAlpha(buffer,), format: "webp", };
  }

  if (
    new TextDecoder().decode(buffer.slice(0, 6,),) === "GIF87a" ||
    new TextDecoder().decode(buffer.slice(0, 6,),) === "GIF89a"
  ) {
    const { width, height, } = parseGifMetadata(buffer,);
    return { width, height, hasAlpha: detectGifAlpha(buffer,), format: "gif", };
  }

  return { width: 0, height: 0, hasAlpha: false, format: "unknown", };
}
