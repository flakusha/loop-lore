// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe buffer public types.
 */

/** Result of a safe Buffer operation */
export type BufferResult<T,> = { ok: true; buffer: T } | { ok: false; error: Error };

/**
 * Typed failure from a safe Buffer guard.
 *
 * Carries the underlying cause so callers that catch can inspect it
 * without string-matching the message.
 */
export class SafeBufferError extends Error {
  override readonly name = "SafeBufferError";
  /** The guard that rejected the input (`safeFromBase64`, `mustFromString`, ...). */
  readonly operation: string;
  /** The original error, when the failure came from a lower-level throw. */
  override readonly cause: Error | undefined;

  constructor(message: string, operation: string, cause?: unknown,) {
    super(message,);
    this.operation = operation;
    this.cause = cause instanceof Error ? cause : undefined;
  }
}

/**
 * Unwrap a guard result, throwing the typed error on failure.
 *
 * The `mustFrom*` variants are exactly this — one implementation, two shapes.
 * The thrown error keeps the guarding function's own `operation`, since that
 * is what actually rejected the input; the entry point is the same guard.
 * @throws {SafeBufferError} when the guard rejected the input
 * @param {BufferResult<T>} result
 * @returns {T}
 */
export function unwrapGuard<T,>(result: BufferResult<T>,): T {
  if (result.ok) { return result.buffer; }
  throw result.error;
}

/** Supported compression algorithms */
export type CompressionAlgorithm = "gzip" | "zstd" | "brotli";
