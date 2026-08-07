/**
 * Safe Buffer — memory-safe Buffer processing with size limits and leak prevention.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`safe-buffer` / `safe-buffer/index`).
 */
export { safeFromBase64, safeToBase64, } from "./base64";
export { safeCompress, safeDecompress, } from "./compression";
export { safeFromString, safeFromUint8Array, } from "./string";
export type { BufferResult, CompressionAlgorithm, } from "./types";
