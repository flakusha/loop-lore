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
import { safeJsonParse, } from "../utils";
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
      if (decoded.trim().startsWith("{",)) { candidates.push(decoded,); }
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
