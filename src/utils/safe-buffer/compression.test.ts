// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { gzipSync, } from "node:zlib";
import { safeCompress, safeDecompress, } from "./compression";

// Build a payload whose compressed size exceeds 10KB but stays well under
// maxSize (10MB) and within maxRatio (1000x). Crypto-random bytes are
// incompressible for gzip/brotli, so the gzip output is roughly the same
// size as the input — exactly the bug case: a payload whose COMPRESSED
// size exceeds 10KB even though DECOMPRESSED fits well under the 10MB cap.
/**
 * @param decompressedBytes
 */
function buildDensePayload(decompressedBytes: number,): Buffer {
  const raw = Buffer.alloc(decompressedBytes,);
  for (let i = 0; i < raw.length; i += 4096) {
    crypto.getRandomValues(raw.subarray(i, Math.min(i + 4096, raw.length,),),);
  }
  return gzipSync(raw,);
}

describe("safeDecompress", () => {
  test("round-trip: 11KB crypto-random plaintext (compressed > 10KB threshold)", () => {
    const compressed = buildDensePayload(11_000,);
    expect(compressed.length,).toBeGreaterThan(10_000,);

    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.buffer.length,).toBe(11_000,); }
  });

  test("round-trip: 50KB crypto-random plaintext (compressed > 10KB)", () => {
    const compressed = buildDensePayload(50_000,);
    expect(compressed.length,).toBeGreaterThan(10_000,);

    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.buffer.length,).toBe(50_000,); }
  });

  test("round-trip: 100KB crypto-random plaintext (original repro size)", () => {
    const compressed = buildDensePayload(100_000,);
    expect(compressed.length,).toBeGreaterThan(10_000,);

    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.buffer.length,).toBe(100_000,); }
  });

  test("post-check: zip bomb (decompressed > maxSize) is still rejected", () => {
    // 11MB plaintext — well over the 10MB maxSize — gzipped. The pre-check
    // would have rejected based on compressed size; the post-check still
    // rejects based on decompressed size.
    const compressed = buildDensePayload(11_000_000,);
    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Decompressed data too large/,);
    }
  });

  test("post-check: zip bomb (high decompress/compress ratio) is still rejected", () => {
    // 5MB of zeros gzips to ~5KB — ratio ~1000x. Exceeds the 1000x limit.
    const bomb = Buffer.alloc(5_000_000, 0,);
    const compressed = gzipSync(bomb,);
    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Compression ratio .* exceeds limit/,);
    }
  });

  test("empty buffer returns ok with empty buffer (early-exit path)", () => {
    const result = safeDecompress(Buffer.alloc(0,), "gzip",);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.buffer.length,).toBe(0,); }
  });

  test("unknown algorithm returns error without throwing", () => {
    const result = safeDecompress(Buffer.from("not-compressed",), "snappy" as never,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Unknown algorithm/,);
    }
  });

  test("invalid gzip data returns error (caught, not thrown)", () => {
    const result = safeDecompress(Buffer.from("this is not gzip data",), "gzip",);
    expect(result.ok,).toBe(false,);
  });

  test("safeCompress + safeDecompress round-trip preserves content", () => {
    const original = Buffer.from("hello world this is a small test string",);
    const compressed = safeCompress(original, "gzip",);
    expect(compressed.ok,).toBe(true,);
    if (!compressed.ok) { return; }
    const decompressed = safeDecompress(compressed.buffer, "gzip",);
    expect(decompressed.ok,).toBe(true,);
    if (decompressed.ok) {
      expect(decompressed.buffer.toString(),).toBe(original.toString(),);
    }
  });

  test("safeCompress rejects oversized input", () => {
    const oversized = Buffer.alloc(11_000_000,); // > 10MB default
    const result = safeCompress(oversized, "gzip",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Input too large/,);
    }
  });
});
