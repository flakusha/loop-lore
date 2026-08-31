// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe base64 encode/decode with size limits.
 */
import { DEFAULT_MAX_BASE64_LEN, DEFAULT_MAX_SIZE, } from "./constants";
import type { BufferResult, } from "./types";

/**
 * Safely decode a base64 string to a Buffer with size limits.
 *
 * Prevents memory exhaustion from oversized base64 inputs.
 * @param encoded - Base64-encoded string
 * @param maxSize - Maximum decoded size in bytes (default: 10 MB)
 * @returns BufferResult with decoded buffer or error
 */
export function safeFromBase64(encoded: string, maxSize = DEFAULT_MAX_SIZE,): BufferResult<Buffer> {
  if (encoded.length === 0) {
    return { ok: false, error: new Error("Empty base64 input",), };
  }

  if (encoded.length > DEFAULT_MAX_BASE64_LEN) {
    return { ok: false, error: new Error(`Base64 input too large: ${encoded.length} chars`,), };
  }

  try {
    const uint8 = Uint8Array.fromBase64(encoded,);
    const buffer = Buffer.from(uint8,);

    if (buffer.length > maxSize) {
      return {
        ok: false,
        error: new Error(`Decoded buffer too large: ${buffer.length} bytes (max: ${maxSize})`,),
      };
    }

    return { ok: true, buffer, };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

/**
 * Safely encode a Buffer to base64 string.
 * @param buffer - Buffer to encode
 * @param maxSize - Maximum buffer size in bytes (default: 10 MB)
 * @returns BufferResult with base64 string or error
 */
export function safeToBase64(buffer: Buffer, maxSize = DEFAULT_MAX_SIZE,): BufferResult<string> {
  if (buffer.length > maxSize) {
    return {
      ok: false,
      error: new Error(`Buffer too large to encode: ${buffer.length} bytes (max: ${maxSize})`,),
    };
  }

  return { ok: true, buffer: buffer.toString("base64",), };
}
