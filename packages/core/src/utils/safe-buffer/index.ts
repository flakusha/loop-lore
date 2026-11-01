// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe Buffer — memory-safe Buffer processing with size limits and leak prevention.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`safe-buffer` / `safe-buffer/index`).
 */
export {
  mustFromBase64,
  mustFromBase64Url,
  safeFromBase64,
  safeFromBase64Url,
  safeToBase64,
} from "./base64";
export { safeCompress, safeDecompress, } from "./compression";
export {
  mustFromString,
  mustFromUint8Array,
  safeFromString,
  safeFromUint8Array,
} from "./string";
export type { BufferResult, CompressionAlgorithm, } from "./types";
export { SafeBufferError, } from "./types";
