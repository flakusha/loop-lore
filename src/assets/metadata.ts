/**
 * Image metadata extraction from raw file headers.
 * No external dependencies — reads binary headers directly.
 * Supports: PNG, JPEG, WebP, GIF.
 */

export interface ImageMetadata {
  width: number;
  height: number;
  caption?: string; // extracted from metadata fields
  format: "png" | "jpeg" | "webp" | "gif" | "unknown";
}

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const IHDR_TYPE = 0x49_48_44_52; // 'IHDR' in big-endian
const TEXTSIG = 0x74_45_58_74; // 'tEXt' in big-endian
const ZTXTSIG = 0x7a_54_58_74; // 'zTXt' in big-endian

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return (buf[offset + 1] << 8) | buf[offset];
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return ((buf[offset + 3] << 24) | (buf[offset + 2] << 16) | (buf[offset + 1] << 8) | buf[offset]) >>> 0;
}

function startsWith(buf: Uint8Array, prefix: Uint8Array): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function parsePngMetadata(buf: Uint8Array): { width: number; height: number; caption?: string } {
  const width = readUint32BE(buf, 16);
  const height = readUint32BE(buf, 20);

  // Scan for tEXt/zTXt chunks for caption
  let offset = 33; // after IHDR chunk (8 sig + 4 len + 4 type + 13 data + 4 CRC)
  let caption: string | undefined;

  while (offset + 8 < buf.length) {
    const chunkLen = readUint32BE(buf, offset);
    const chunkType = readUint32BE(buf, offset + 4);

    if (chunkType === 0x49_45_4e_44) break; // IEND
    if (chunkType === TEXTSIG || chunkType === ZTXTSIG) {
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkLen;
      if (dataEnd <= buf.length) {
        // Find null separator between key and value
        let nullPos = dataStart;
        while (nullPos < dataEnd && buf[nullPos] !== 0) nullPos++;
        const key = new TextDecoder().decode(buf.slice(dataStart, nullPos));
        const valStart = nullPos + 1;
        if (valStart < dataEnd) {
          let val: string;
          if (chunkType === ZTXTSIG && buf[valStart] === 0) {
            // zTXt with compression method 0 (deflate) — skip for now, return compressed
            val = new TextDecoder().decode(buf.slice(valStart + 1, dataEnd));
          } else {
            val = new TextDecoder().decode(buf.slice(valStart, dataEnd));
          }
          if ((key === "Description" || key === "Comment" || key === "Title") && !caption) {
            caption = val;
          }
        }
      }
    }

    offset += 12 + chunkLen; // skip chunk (len + type + data + CRC)
  }

  return { width, height, caption };
}

function parseJpegMetadata(buf: Uint8Array): { width: number; height: number; caption?: string } {
  let offset = 2;
  let caption: string | undefined;

  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) {
      // SOI, EOI, padding
      offset++;
      continue;
    }

    if (marker === 0xfe) {
      // COM (comment) marker
      const segLen = readUint16BE(buf, offset + 2);
      if (segLen >= 3) {
        caption = new TextDecoder().decode(buf.slice(offset + 4, offset + 2 + segLen));
      }
      offset += 2 + segLen;
      continue;
    }

    // SOF0-SOF15 markers (start of frame) — contains dimensions
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      offset + 11 <= buf.length
    ) {
      const height = readUint16BE(buf, offset + 5);
      const width = readUint16BE(buf, offset + 7);
      return { width, height, caption };
    }

    const segLen = readUint16BE(buf, offset + 2);
    if (segLen < 2) break;
    offset += 2 + segLen;
  }

  return { width: 0, height: 0, caption };
}

function parseWebpMetadata(buf: Uint8Array): { width: number; height: number; caption?: string } {
  // RIFF header: 4 bytes "RIFF" + 4 bytes file size + 4 bytes "WEBP"
  // VP8/VP8L/VP8X chunk follows
  if (buf.length < 20) return { width: 0, height: 0 };

  let offset = 12; // Start of chunk header after RIFF header
  let caption: string | undefined;

  while (offset + 8 <= buf.length) {
    const chunkTag = new TextDecoder().decode(buf.slice(offset, offset + 4));
    const chunkSize = readUint32LE(buf, offset + 4);
    const chunkEnd = offset + 8 + chunkSize;

    if (chunkTag === "VP8 " && chunkSize >= 10) {
      // VP8 keyframe header: 3 bytes frame tag, then 16 bits width/height
      const raw = readUint16LE(buf, offset + 14);
      const width = raw & 0x3f_ff;
      const height = readUint16LE(buf, offset + 16) & 0x3f_ff;
      return { width, height, caption };
    }

    if (chunkTag === "VP8L" && chunkSize >= 5) {
      // VP8L lossless header
      const bits = readUint32LE(buf, offset + 12);
      const width = (bits & 0x3f_ff) + 1;
      const height = ((bits >> 14) & 0x3f_ff) + 1;
      return { width, height, caption };
    }

    if (chunkTag === "VP8X") {
      // VP8X extended header — bits 16-17 have width/height
      const width = ((buf[offset + 12] | (buf[offset + 13] << 8)) & 0x3f_ff) + 1;
      const height = ((buf[offset + 14] | (buf[offset + 15] << 8)) & 0x3f_ff) + 1;
      return { width, height, caption };
    }

    // Check for EXIF chunk (metadata) — skip

    if (chunkSize === 0) break;
    offset = chunkEnd;
    // Align to even boundary
    if (chunkEnd % 2 !== 0) offset++;
  }

  return { width: 0, height: 0, caption };
}

function parseGifMetadata(buf: Uint8Array): { width: number; height: number; caption?: string } {
  const width = readUint16LE(buf, 6);
  const height = readUint16LE(buf, 8);
  return { width, height };
}

/**
 * Extract metadata from an image buffer.
 * Returns dimensions, format, and optional caption.
 */
export function extractImageMetadata(buffer: Uint8Array): ImageMetadata {
  if (startsWith(buffer, PNG_HEADER)) {
    const { width, height, caption } = parsePngMetadata(buffer);
    return { width, height, caption, format: "png" };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const { width, height, caption } = parseJpegMetadata(buffer);
    return { width, height, caption, format: "jpeg" };
  }

  if (
    buffer.length >= 12 &&
    new TextDecoder().decode(buffer.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(buffer.slice(8, 12)) === "WEBP"
  ) {
    const { width, height, caption } = parseWebpMetadata(buffer);
    return { width, height, caption, format: "webp" };
  }

  if (
    new TextDecoder().decode(buffer.slice(0, 6)) === "GIF87a" ||
    new TextDecoder().decode(buffer.slice(0, 6)) === "GIF89a"
  ) {
    const { width, height } = parseGifMetadata(buffer);
    return { width, height, format: "gif" };
  }

  return { width: 0, height: 0, format: "unknown" };
}
