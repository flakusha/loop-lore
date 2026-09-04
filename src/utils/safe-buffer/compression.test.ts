// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { gzipSync, } from "node:zlib";
import { safeCompress, safeDecompress, } from "./compression";
import { DEFAULT_MAX_RATIO, DEFAULT_MAX_SIZE, } from "./constants";

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

  // Runtime-driven boundary tests: read limits from constants so future raises
  // of DEFAULT_MAX_RATIO / DEFAULT_MAX_SIZE shift assertion targets (rather
  // than silently re-pin a stale value).
  test("boundary: decompressed/compressed ratio just under DEFAULT_MAX_RATIO passes", () => {
    // 1MB of zeros gzips to ~1003B — ratio ~997x, just under DEFAULT_MAX_RATIO (1000x).
    const under = Buffer.alloc(1_000_000, 0,);
    const compressed = gzipSync(under,);
    const actualRatio = under.length / compressed.length;
    expect(actualRatio,).toBeLessThan(DEFAULT_MAX_RATIO,);

    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.buffer.length,).toBe(1_000_000,); }
  });

  test("boundary: decompressed/compressed ratio just over DEFAULT_MAX_RATIO is rejected", () => {
    // 1.2MB of zeros gzips to ~1198B — ratio ~1001.67x, just over DEFAULT_MAX_RATIO (1000x).
    // Far below DEFAULT_MAX_SIZE (10MB) so the size cap cannot fire first.
    const over = Buffer.alloc(1_200_000, 0,);
    const compressed = gzipSync(over,);
    const actualRatio = over.length / compressed.length;
    expect(actualRatio,).toBeGreaterThan(DEFAULT_MAX_RATIO,);
    expect(over.length,).toBeLessThan(DEFAULT_MAX_SIZE,);

    const result = safeDecompress(compressed, "gzip",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Compression ratio .* exceeds limit/,);
    }
  });

  test("boundary: absolute byte cap fires before ratio check", () => {
    // Crypto-random 11MB plaintext: incompressible, so decompressed/compressed
    // ratio is ~1x (well under DEFAULT_MAX_RATIO) but decompressed length
    // exceeds DEFAULT_MAX_SIZE. The size cap must reject this BEFORE the ratio
    // check runs, so the error must be the size one, not the ratio one.
    const oversized = buildDensePayload(11_000_000,);
    const result = safeDecompress(oversized, "gzip",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error.message,).toMatch(/Decompressed data too large/,);
      expect(result.error.message,).not.toMatch(/Compression ratio/,);
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
