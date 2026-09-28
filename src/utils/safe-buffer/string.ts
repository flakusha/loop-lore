// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe Buffer creation from strings and typed arrays.
 */
import { DEFAULT_MAX_SIZE, } from "./constants";
import { type BufferResult, SafeBufferError, unwrapGuard, } from "./types";

/**
 * Safely create a Buffer from a string with size limits.
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
      error: new SafeBufferError(
        `String too large: ${text.length} chars (max: ${maxSize})`,
        "safeFromString",
      ),
    };
  }

  try {
    return { ok: true, buffer: Buffer.from(text, encoding,), };
  } catch (error) {
    return {
      ok: false,
      error: new SafeBufferError(
        error instanceof Error ? error.message : String(error,),
        "safeFromString",
        error,
      ),
    };
  }
}

/**
 * Size-check an already-binary view and adopt it as a Buffer.
 *
 * This performs NO decoding: the caller must already hold bytes. Passing a
 * `Buffer` built by `Buffer.from(someString)` launders an unvalidated
 * string-to-bytes coercion through a guard that cannot catch it, so the
 * encoder call belongs in `safeFromString` / `mustFromString` instead.
 * @param uint8 - Uint8Array of bytes to adopt
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
      error: new SafeBufferError(
        `Uint8Array too large: ${uint8.byteLength} bytes (max: ${maxSize})`,
        "safeFromUint8Array",
      ),
    };
  }

  return { ok: true, buffer: Buffer.from(uint8,), };
}

/**
 * Encode a string to a Buffer or throw `SafeBufferError`.
 * @throws {SafeBufferError} when the string exceeds `maxSize` or the encoding fails
 */
export function mustFromString(
  text: string,
  encoding: BufferEncoding = "utf8",
  maxSize = DEFAULT_MAX_SIZE,
): Buffer {
  return unwrapGuard(safeFromString(text, encoding, maxSize,),);
}

/**
 * Size-check and adopt a Uint8Array, or throw `SafeBufferError`.
 * @throws {SafeBufferError} when the array exceeds `maxSize`
 */
export function mustFromUint8Array(uint8: Uint8Array, maxSize = DEFAULT_MAX_SIZE,): Buffer {
  return unwrapGuard(safeFromUint8Array(uint8, maxSize,),);
}
