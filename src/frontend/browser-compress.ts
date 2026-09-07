// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  base64ToUint8Array,
  stringToUint8Array,
  uint8ArrayToBase64,
  uint8ArrayToString,
} from "./compress-codecs";

/** */
export type BrowserContentEncoding = "identity" | "gzip" | "brotli" | "zstd";

/** */
export interface BrowserEncodeResult {
  encoded: string;
  encoding: BrowserContentEncoding;
}

/**
 * @param data
 */
async function tryGzipCompress(data: Uint8Array,): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") { return null; }
  try {
    const stream = new CompressionStream("gzip",);
    const writer = stream.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>,);
    await writer.close();
    const response = new Response(stream.readable,);
    return new Uint8Array(await response.arrayBuffer(),);
  } catch {
    return null;
  }
}

/**
 * @param data
 */
async function tryGzipDecompress(data: Uint8Array,): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") { return null; }
  try {
    const stream = new DecompressionStream("gzip",);
    const blob = new Blob([data as Uint8Array<ArrayBuffer>,],);
    const input = blob.stream().pipeThrough(stream,);
    const response = new Response(input,);
    return new Uint8Array(await response.arrayBuffer(),);
  } catch {
    return null;
  }
}

/** WASM module type (avoids cross-bundle import). */
export interface WasmZstdModule {
  zstd: {
    compress(data: Uint8Array, level: number,): Uint8Array | null;
    decompress(data: Uint8Array, outCapacity: number,): Uint8Array | null;
    /** Optional probe; returns exact decompressed size when the module exposes it. */
    decompressBound?(data: Uint8Array,): number;
  };
}

/**
 * Resolve WASM module from global (set by wasm-loader.ts).
 * Returns null when unavailable or loading fails.
 */
async function getWasmZstd(): Promise<WasmZstdModule | null> {
  const pending = (globalThis as Record<string, unknown>).__loopLoreWasm;
  if (!pending) { return null; }
  try {
    return await (pending as Promise<WasmZstdModule | null>);
  } catch {
    return null;
  }
}

/**
 * @param data
 * @param zstd Optional pre-resolved module — passed only by callers that
 *   already hold one (tests); omitted in production.
 */
async function tryZstdCompress(data: Uint8Array, zstd?: WasmZstdModule | null,): Promise<Uint8Array | null> {
  const wasm = zstd !== undefined ? zstd : await getWasmZstd();
  if (wasm === null) { return null; }
  return wasm.zstd.compress(data, 3,);
}

/**
 * @param data
 */
async function tryBrotliCompress(data: Uint8Array,): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") { return null; }
  try {
    const stream = new CompressionStream("brotli" as CompressionFormat,);
    const writer = stream.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>,);
    await writer.close();
    const response = new Response(stream.readable,);
    return new Uint8Array(await response.arrayBuffer(),);
  } catch {
    return null;
  }
}

/**
 * @param data
 */
async function tryBrotliDecompress(data: Uint8Array,): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") { return null; }
  try {
    const stream = new DecompressionStream("brotli" as CompressionFormat,);
    const blob = new Blob([data as Uint8Array<ArrayBuffer>,],);
    const input = blob.stream().pipeThrough(stream,);
    const response = new Response(input,);
    return new Uint8Array(await response.arrayBuffer(),);
  } catch {
    return null;
  }
}

/**
 * Maximum output capacity for zstd decompression, matching backend
 * `safeDecompress` DEFAULT_MAX_RATIO (1000x) so server-produced payloads
 * never fail on the browser side.
 */
const MAX_ZSTD_DECOMPRESS_RATIO = 1000;

/**
 * @param data
 * @param zstd Optional pre-resolved module — passed only by callers that
 *   already hold one (tests); omitted in production.
 * @returns decompressed bytes, or null when zstd is unavailable or the
 *   payload cannot be decoded (caller distinguishes identity content).
 */
async function tryZstdDecompress(data: Uint8Array, zstd?: WasmZstdModule | null,): Promise<Uint8Array | null> {
  const wasm = zstd !== undefined ? zstd : await getWasmZstd();
  if (wasm === null) { return null; }

  const bound = wasm.zstd.decompressBound?.(data,);
  if (typeof bound === "number" && Number.isFinite(bound,)) {
    // Exact-size probe (internal zstd API) — single pass, no growth loop.
    return wasm.zstd.decompress(data, Math.max(bound, data.length,),);
  }

  // No bound probe: grow from 16x up to the backend parity cap. wasm returns
  // null when the output capacity is too small, so retry with a larger buffer.
  let capacity = data.length * 16;
  let result: Uint8Array | null = null;
  while (capacity <= data.length * MAX_ZSTD_DECOMPRESS_RATIO) {
    result = wasm.zstd.decompress(data, capacity,);
    if (result !== null) { return result; }
    capacity *= 2;
  }
  return null;
}

/**
 * @param encoding
 */
function getEncoderPriority(encoding: BrowserContentEncoding,): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd") { return ["zstd", "gzip",]; }
  if (encoding === "brotli") { return ["brotli", "gzip",]; }
  return ["gzip",];
}

/**
 * @param encoding
 */
function getDecoderPriority(encoding: BrowserContentEncoding,): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd" || encoding === "brotli") { return [encoding,]; }
  return ["gzip", "brotli", "zstd",];
}

/** Optional per-call overrides — currently only a pre-resolved zstd module. */
export interface BrowserContentOptions {
  /** Pre-resolved zstd module (tests); default reads window.__loopLoreWasm. */
  zstd?: WasmZstdModule | null;
}

/**
 * @param plaintext
 * @param encoding
 * @param options Optional per-call overrides (zstd module injection).
 */
export async function browserEncodeContent(
  plaintext: string,
  encoding: BrowserContentEncoding = "gzip",
  options: BrowserContentOptions = {},
): Promise<BrowserEncodeResult> {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity", };
  }
  const uint8 = stringToUint8Array(plaintext,);
  if (uint8.length < 128) {
    return { encoded: plaintext, encoding: "identity", };
  }
  for (const algo of getEncoderPriority(encoding,)) {
    let result: Uint8Array | null;
    if (algo === "zstd") { result = await tryZstdCompress(uint8, options.zstd,); }
    else if (algo === "brotli") { result = await tryBrotliCompress(uint8,); }
    else { result = await tryGzipCompress(uint8,); }
    if (result && result.length < uint8.length) {
      return { encoded: uint8ArrayToBase64(result,), encoding: algo, };
    }
  }
  return { encoded: plaintext, encoding: "identity", };
}

/**
 * @param stored
 * @param encoding
 * @param options Optional per-call overrides (zstd module injection).
 */
export async function browserDecodeContent(
  stored: string,
  encoding: BrowserContentEncoding,
  options: BrowserContentOptions = {},
): Promise<string> {
  if (encoding === "identity" || !stored) { return stored; }
  const uint8 = base64ToUint8Array(stored,);
  for (const algo of getDecoderPriority(encoding,)) {
    let result: Uint8Array | null;
    if (algo === "zstd") { result = await tryZstdDecompress(uint8, options.zstd,); }
    else if (algo === "brotli") { result = await tryBrotliDecompress(uint8,); }
    else { result = await tryGzipDecompress(uint8,); }
    if (result) { return uint8ArrayToString(result,); }
  }
  // Declared non-identity content that no decoder could open is corruption,
  // not plaintext — surfacing it as "decoded" would render base64 soup.
  throw new Error(`browserDecodeContent: failed to decode ${encoding} content (all decoders returned null)`,);
}
