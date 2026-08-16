// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * PNG character-card steganography reader.
 *
 * Extracts character data hidden in PNG `tEXt` / `zTXt` / `iTXt` text chunks
 * (the convention used by SillyTavern / CharacterAI V2/V3 cards). The payload
 * is typically base64-encoded JSON, occasionally raw JSON.
 *
 * Pure TypeScript — no external dependency.
 */

import { inflateSync, } from "node:zlib";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import { safeFromBase64, } from "../utils/safe-buffer";

export interface ExtractedCharacter {
  /** Parsed card payload. For V2 cards this is the `data` object. */
  data: Record<string, unknown>;
  /** Detected spec, e.g. "chara_card_v2". */
  spec?: string;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10,];

/**
 * Extract embedded character data from a PNG buffer.
 *
 * @param buffer raw PNG file bytes
 * @returns parsed card payload, or null if not a PNG / no data found
 */
export function extractCharacterDataFromPng(buffer: Buffer,): ExtractedCharacter | null {
  if (buffer.length < 8) { return null; }
  for (const [i, element,] of PNG_SIGNATURE.entries()) {
    if (buffer[i] !== element) { return null; }
  }

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset,);
    const type = buffer.toString("ascii", offset + 4, offset + 8,);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) { break; }

    if (["tEXt", "zTXt", "iTXt",].includes(type,)) {
      const text = decodeTextChunk(buffer, dataStart, length, type,);
      const parsed = tryParseCharacter(text,);
      if (parsed) { return parsed; }
    }

    offset = dataEnd + 4; // skip CRC
  }

  return null;
}

function decodeTextChunk(buffer: Buffer, start: number, length: number, type: string,): string | null {
  const end = start + length;
  const nullIdx = buffer.indexOf(0, start, "latin1",);
  if (nullIdx === -1 || nullIdx >= end) { return null; }

  if (type === "tEXt") {
    return buffer.toString("latin1", nullIdx + 1, end,);
  }

  if (type === "zTXt") {
    const method = buffer[nullIdx + 1];
    if (method !== 0) { return null; }
    const compressed = buffer.subarray(nullIdx + 2, end,);
    try {
      return inflateSync(compressed,).toString("latin1",);
    } catch {
      return null;
    }
  }

  // iTXt
  const compressionFlag = buffer[nullIdx + 1];
  let cursor = nullIdx + 2;
  const langEnd = buffer.indexOf(0, cursor, "latin1",);
  if (langEnd === -1 || langEnd >= end) { return null; }
  cursor = langEnd + 1;
  const transEnd = buffer.indexOf(0, cursor, "latin1",);
  if (transEnd === -1 || transEnd >= end) { return null; }
  const textStart = transEnd + 1;

  if (compressionFlag === 1) {
    const compressed = buffer.subarray(textStart, end,);
    try {
      return inflateSync(compressed,).toString("latin1",);
    } catch {
      return null;
    }
  }
  return buffer.toString("latin1", textStart, end,);
}

function tryParseCharacter(text: string | null,): ExtractedCharacter | null {
  if (!text) { return null; }
  const candidates: string[] = [];
  candidates.push(text,);
  try {
    const decodedResult = safeFromBase64(text,);
    if (decodedResult.ok) {
      const decoded = decodedResult.buffer.toString("utf8",);
      if (decoded.trimStart().startsWith("{",)) { candidates.push(decoded,); }
    }
  } catch {
    /* not base64 */
  }

  for (const candidate of candidates) {
    const result = safeJsonParse<Record<string, unknown>>(candidate,);
    if (result.ok && result.value && typeof result.value === "object") {
      const spec = typeof result.value.spec === "string" ? result.value.spec : undefined;
      const data = (result.value.data as Record<string, unknown> | undefined) ?? result.value;
      return { data, spec, };
    }
  }
  return null;
}

// ── PNG Writer ────────────────────────────────────────────────

/**
 * Minimal 1×1 white pixel PNG (67 bytes).
 * Used as a base image when no avatar is available for export.
 */
const MINIMAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000" +
    "907753de0000000c4944415478016360f8cf000000020001e221bc3300" +
    "00000049454e44ae426082",
  "hex",
);

/**
 * Build a PNG tEXt chunk: [length:4][type:4][keyword\0value][crc:4]
 */
function buildTextChunk(keyword: string, value: string,): Buffer {
  const payload = Buffer.alloc(keyword.length + 1 + value.length,);
  Buffer.from(keyword, "latin1",).copy(payload,);
  payload[keyword.length] = 0; // null separator
  Buffer.from(value, "latin1",).copy(payload, keyword.length + 1,);

  const length = Buffer.alloc(4,);
  length.writeUInt32BE(payload.length,);

  const type = Buffer.from("tEXt", "ascii",);

  // CRC-32 over type + payload (per PNG spec)
  const crcData = Buffer.concat([type, payload,],);
  const crc = crc32(crcData,);
  const crcBuf = Buffer.alloc(4,);
  crcBuf.writeUInt32BE(crc,);

  return Buffer.concat([length, type, payload, crcBuf,],);
}

/**
 * Simple CRC-32 (IEEE 802.3) for PNG chunk checksums.
 */
function crc32(buf: Buffer,): number {
  let crc = 0xFF_FF_FF_FF;
  for (const byte of buf) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xED_B8_83_20 : 0);
    }
  }
  return (crc ^ 0xFF_FF_FF_FF) >>> 0;
}

/**
 * Insert character card data into a PNG buffer as V2 + V3 tEXt chunks.
 *
 * Writes both `chara` (V2) and `ccv3` (V3) chunks for maximum compatibility.
 * Existing text chunks in the input PNG are preserved.
 *
 * @param pngBase - base PNG image buffer (use `MINIMAL_PNG` if no avatar exists)
 * @param characterData - the `data` object from the character card (not wrapped in spec envelope)
 * @returns new PNG buffer with character data embedded
 */
export function insertCharacterDataIntoPng(
  pngBase: Buffer,
  characterData: Record<string, unknown>,
): Buffer {
  if (pngBase.length < 8) {
    throw new Error("Invalid PNG: too short",);
  }

  // Verify PNG signature
  for (const [i, element,] of PNG_SIGNATURE.entries()) {
    if (pngBase[i] !== element) {
      throw new Error("Invalid PNG: bad signature",);
    }
  }

  // Build V2 payload: base64( JSON({"spec":"chara_card_v2","data":{...}}) )
  const v2Envelope = { spec: "chara_card_v2", data: characterData, };
  const v2Base64 = Buffer.from(jsonStringifyOr(v2Envelope,), "utf8",).toString("base64",);

  // Build V3 payload: base64( JSON({"spec":"chara_card_v3","data":{...}}) )
  const v3Envelope = { spec: "chara_card_v3", data: characterData, };
  const v3Base64 = Buffer.from(jsonStringifyOr(v3Envelope,), "utf8",).toString("base64",);

  const v2Chunk = buildTextChunk("chara", v2Base64,);
  const v3Chunk = buildTextChunk("ccv3", v3Base64,);

  // Find insertion point: before IEND chunk (end of PNG)
  const iendOffset = findIendOffset(pngBase,);
  if (iendOffset === -1) {
    throw new Error("Invalid PNG: IEND chunk not found",);
  }

  // IEND chunk = 4 (length=0) + 4 (type) + 4 (crc) = 12 bytes total
  const insertAt = iendOffset;
  const before = pngBase.subarray(0, insertAt,);
  const after = pngBase.subarray(insertAt,);

  return Buffer.concat([before, v2Chunk, v3Chunk, after,],);
}

/**
 * Find the byte offset of the IEND chunk (start of its 12-byte block).
 */
function findIendOffset(buffer: Buffer,): number {
  let offset = 8; // skip PNG signature
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset + 4, offset + 8,);
    if (type === "IEND") {
      return offset; // offset points to IEND's length field — insert before it
    }
    const length = buffer.readUInt32BE(offset,);
    offset += 12 + length; // 4 (length) + 4 (type) + length + 4 (crc)
  }
  return -1;
}

/**
 * Get a minimal PNG buffer suitable for character card export.
 */
export function getMinimalPng(): Buffer {
  return Buffer.from(MINIMAL_PNG,);
}
