/**
 * Safe Buffer creation from strings and typed arrays.
 */
import { DEFAULT_MAX_SIZE, } from "./constants";
import type { BufferResult, } from "./types";

/**
 * Safely create a Buffer from a string with size limits.
 *
 * @param text - String to encode
 * @param encoding - String encoding (default: "utf8")
 * @param maxSize - Maximum string length (default: 10 MB)
 * @returns BufferResult with buffer or error
 */
export function safeFromString(
  text: string,
  encoding: BufferEncoding = "utf8",
  maxSize = DEFAULT_MAX_SIZE,
): BufferResult<Buffer> {
  if (text.length > maxSize) {
    return {
      ok: false,
      error: new Error(`String too large: ${text.length} chars (max: ${maxSize})`,),
    };
  }

  try {
    return { ok: true, buffer: Buffer.from(text, encoding,), };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

/**
 * Safely create a Buffer from a Uint8Array with size limits.
 *
 * @param uint8 - Uint8Array to convert
 * @param maxSize - Maximum array length (default: 10 MB)
 * @returns BufferResult with buffer or error
 */
export function safeFromUint8Array(
  uint8: Uint8Array,
  maxSize = DEFAULT_MAX_SIZE,
): BufferResult<Buffer> {
  if (uint8.byteLength > maxSize) {
    return {
      ok: false,
      error: new Error(`Uint8Array too large: ${uint8.byteLength} bytes (max: ${maxSize})`,),
    };
  }

  return { ok: true, buffer: Buffer.from(uint8,), };
}
