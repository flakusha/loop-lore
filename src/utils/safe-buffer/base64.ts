// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe base64 encode/decode with size limits.
 */
import { DEFAULT_MAX_BASE64_LEN, DEFAULT_MAX_SIZE, } from "./constants";
import { type BufferResult, SafeBufferError, unwrapGuard, } from "./types";

/** Alphabet accepted by a decode variant. */
type Base64Alphabet = "base64" | "base64url";

/**
 * Rewrite base64url input into the standard alphabet so the strict decoder
 * accepts it. `toString("base64url")` emits `-` and `_` in place of `+`
 * and `/`; valid padding is already accepted by `Uint8Array.fromBase64`,
 * so only the alphabet differs.
 * @param encoded
 * @param alphabet
 */
function normalizeAlphabet(encoded: string, alphabet: Base64Alphabet,): string {
  return alphabet === "base64url" ? encoded.replaceAll("-", "+",).replaceAll("_", "/",) : encoded;
}

/**
 * The one base64 guard. Every decode variant and every throwing variant
 * routes through here, so the size and strictness rules cannot drift apart.
 * @param encoded
 * @param root0
 * @param root0.alphabet
 * @param root0.maxSize
 * @param root0.operation
 */
function guardDecode(
  encoded: string,
  { alphabet, maxSize, operation, }: {
    alphabet: Base64Alphabet;
    maxSize: number;
    operation: string;
  },
): BufferResult<Buffer> {
  if (encoded.length === 0) {
    return { ok: false, error: new SafeBufferError("Empty base64 input", operation,), };
  }

  // `Uint8Array.fromBase64` strips ASCII whitespace, so a value would have
  // several valid encoded forms. Reject instead: the accepted set is exactly
  // the canonical alphabet.
  if (/\s/u.test(encoded,)) {
    return { ok: false, error: new SafeBufferError("Base64 input contains whitespace", operation,), };
  }

  // A non-finite or non-positive cap is a caller bug, not a licence to decode
  // without a limit; fall back to the default rather than disabling the guard.
  const limit = Number.isFinite(maxSize,) && maxSize > 0 ? maxSize : DEFAULT_MAX_SIZE;

  // Work bound derived from the caller's cap, with the global ceiling as a hard
  // maximum. The post-decode size check stays the exact cap; this only stops
  // oversized input from being decoded at all.
  const maxEncodedLen = Math.min(DEFAULT_MAX_BASE64_LEN, Math.ceil((limit + 2) / 3,) * 4 + 2,);
  if (encoded.length > maxEncodedLen) {
    return {
      ok: false,
      error: new SafeBufferError(`Base64 input too large: ${encoded.length} chars`, operation,),
    };
  }

  try {
    const uint8 = Uint8Array.fromBase64(normalizeAlphabet(encoded, alphabet,),);
    const buffer = Buffer.from(uint8,);

    if (buffer.length > limit) {
      return {
        ok: false,
        error: new SafeBufferError(
          `Decoded buffer too large: ${buffer.length} bytes (max: ${limit})`,
          operation,
        ),
      };
    }

    return { ok: true, buffer, };
  } catch (error) {
    return {
      ok: false,
      error: new SafeBufferError(error instanceof Error ? error.message : String(error,), operation, error,),
    };
  }
}

/**
 * Safely decode a standard-alphabet base64 string with size limits.
 *
 * Prevents memory exhaustion from oversized base64 inputs, and rejects
 * malformed input that `Buffer.from(s, "base64")` would silently truncate.
 *
 * Accepted input is exactly RFC 4648 §4 (standard alphabet) with optional
 * padding, and nothing else: no ASCII whitespace, no other variants.
 * @param encoded - Base64-encoded string
 * @param maxSize - Maximum decoded size in bytes (default: 10 MB)
 * @returns BufferResult with decoded buffer or error
 */
export function safeFromBase64(encoded: string, maxSize = DEFAULT_MAX_SIZE,): BufferResult<Buffer> {
  return guardDecode(encoded, { alphabet: "base64", maxSize, operation: "safeFromBase64", },);
}

/**
 * Safely decode a base64url string (RFC 4648 §5) with size limits.
 *
 * Accepts the `-`/`_` alphabet emitted by `toString("base64url")`, which
 * `safeFromBase64` rejects. Padding is optional in base64url and accepted
 * when present.
 *
 * Accepted input is exactly RFC 4648 §5 (url-safe alphabet) with optional
 * padding, and nothing else: no ASCII whitespace, no other variants.
 * @param encoded - base64url-encoded string
 * @param maxSize - Maximum decoded size in bytes (default: 10 MB)
 * @returns BufferResult with decoded buffer or error
 */
export function safeFromBase64Url(encoded: string, maxSize = DEFAULT_MAX_SIZE,): BufferResult<Buffer> {
  return guardDecode(encoded, { alphabet: "base64url", maxSize, operation: "safeFromBase64Url", },);
}

/**
 * Decode standard base64 or throw `SafeBufferError`.
 * @param encoded
 * @param maxSize
 * @throws {SafeBufferError} when the input is empty, oversized, or malformed
 */
export function mustFromBase64(encoded: string, maxSize = DEFAULT_MAX_SIZE,): Buffer {
  return unwrapGuard(safeFromBase64(encoded, maxSize,),);
}

/**
 * Decode base64url or throw `SafeBufferError`.
 * @param encoded
 * @param maxSize
 * @throws {SafeBufferError} when the input is empty, oversized, or malformed
 */
export function mustFromBase64Url(encoded: string, maxSize = DEFAULT_MAX_SIZE,): Buffer {
  return unwrapGuard(safeFromBase64Url(encoded, maxSize,),);
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
