// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { fromBase64, toBase64, } from "../utils/base64";

export type BrowserContentEncoding = "identity" | "gzip" | "brotli" | "zstd";

export interface BrowserEncodeResult {
  encoded: string;
  encoding: BrowserContentEncoding;
}

function stringToUint8Array(str: string,): Uint8Array {
  return new TextEncoder().encode(str,);
}

function uint8ArrayToString(buf: Uint8Array,): string {
  return new TextDecoder().decode(buf,);
}

function uint8ArrayToBase64(buf: Uint8Array,): string {
  return toBase64(buf,);
}

function base64ToUint8Array(b64: string,): Uint8Array {
  return fromBase64(b64,);
}

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
interface WasmZstdModule {
  zstd: {
    compress(data: Uint8Array, level: number,): Uint8Array | null;
    decompress(data: Uint8Array, outCapacity: number,): Uint8Array | null;
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

async function tryZstdCompress(data: Uint8Array,): Promise<Uint8Array | null> {
  const wasm = await getWasmZstd();
  if (wasm === null) { return null; }
  return wasm.zstd.compress(data, 3,);
}

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

async function tryZstdDecompress(data: Uint8Array,): Promise<Uint8Array | null> {
  const wasm = await getWasmZstd();
  if (wasm === null) { return null; }
  // Probe decompress bound first via try (wasm.decompressBound called internally).
  return wasm.zstd.decompress(data, data.length * 16,); // generous initial capacity
}

function getEncoderPriority(encoding: BrowserContentEncoding,): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd") { return ["zstd", "gzip",]; }
  if (encoding === "brotli") { return ["brotli", "gzip",]; }
  return ["gzip",];
}

function getDecoderPriority(encoding: BrowserContentEncoding,): ("zstd" | "brotli" | "gzip")[] {
  if (encoding === "zstd" || encoding === "brotli") { return [encoding,]; }
  return ["gzip", "brotli", "zstd",];
}

export async function browserEncodeContent(
  plaintext: string,
  encoding: BrowserContentEncoding = "gzip",
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
    if (algo === "zstd") { result = await tryZstdCompress(uint8,); }
    else if (algo === "brotli") { result = await tryBrotliCompress(uint8,); }
    else { result = await tryGzipCompress(uint8,); }
    if (result && result.length < uint8.length) {
      return { encoded: uint8ArrayToBase64(result,), encoding: algo, };
    }
  }
  return { encoded: plaintext, encoding: "identity", };
}

export async function browserDecodeContent(
  stored: string,
  encoding: BrowserContentEncoding,
): Promise<string> {
  if (encoding === "identity" || !stored) { return stored; }
  const uint8 = base64ToUint8Array(stored,);
  for (const algo of getDecoderPriority(encoding,)) {
    let result: Uint8Array | null;
    if (algo === "zstd") { result = await tryZstdDecompress(uint8,); }
    else if (algo === "brotli") { result = await tryBrotliDecompress(uint8,); }
    else { result = await tryGzipDecompress(uint8,); }
    if (result) { return uint8ArrayToString(result,); }
  }
  return stored;
}
