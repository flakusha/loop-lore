// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for browser content encoding/decode — especially zstd decompression
 * capacity handling (fixed 16x output cap regression) and corruption surfacing.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { browserDecodeContent, browserEncodeContent, } from "./browser-compress";

// ── fake wasm module harness ──────────────────────────────────

interface FakeZstd {
  compress(data: Uint8Array, level: number,): Uint8Array | null;
  decompress(data: Uint8Array, outCapacity: number,): Uint8Array | null;
  decompressBound?(data: Uint8Array,): number | null;
}

/** Store the active fake so individual tests can mutate it. */
function installFakeZstd(fake: FakeZstd | null,): void {
  (globalThis as Record<string, unknown>).__loopLoreWasm = fake === null
    ? null
    : Promise.resolve({ zstd: fake, },);
}

const textEncoder = new TextEncoder();

const REAL_DECOMPRESSED = textEncoder.encode("hello",);

afterEach(() => {
  installFakeZstd(null,);
},);

// ── helpers ───────────────────────────────────────────────────

function b64(data: Uint8Array,): string {
  // Minimal base64 for tests (Bun global atob/btoa).
  return btoa(String.fromCharCode(...data,),);
}

// ── zstd decompression capacity ────────────────────────────────

describe("tryZstdDecompress capacity (regression: fixed 16x cap)", () => {
  test("grows output capacity beyond 16x when wasm needs it", async () => {
    const attempts: number[] = [];
    installFakeZstd({
      compress: () => null,
      decompress(data, outCapacity,) {
        attempts.push(outCapacity,);
        // First attempt at 16x fails (too small) — real output needs 20x.
        if (outCapacity < data.length * 20) { return null; }
        return REAL_DECOMPRESSED;
      },
    },);

    const encoded = b64(textEncoder.encode("x",),);
    const result = await browserDecodeContent(encoded, "zstd",);

    expect(result,).toBe("hello",);
    // Growth sequence started at 16x and doubled until the payload fit —
    // beyond the old fixed 16x cap.
    expect(attempts[0],).toBe(16,);
    expect(attempts.at(-1) ?? 0,).toBeGreaterThan(16,);
  },);

  test("uses decompressBound probe when available (single pass)", async () => {
    let capacityUsed = 0;
    installFakeZstd({
      compress: () => null,
      decompress(_data, outCapacity,) {
        capacityUsed = outCapacity;
        return REAL_DECOMPRESSED;
      },
      decompressBound: () => 7,
    },);

    const encoded = b64(textEncoder.encode("x",),);
    const result = await browserDecodeContent(encoded, "zstd",);

    expect(result,).toBe("hello",);
    // Exact bound: max(bound, input length), no growth loop.
    expect(capacityUsed,).toBe(7,);
  },);

  test("throws on undecodable declared zstd content instead of returning base64", async () => {
    installFakeZstd({
      compress: () => null,
      decompress: () => null, // never succeeds at any capacity
    },);

    const encoded = b64(textEncoder.encode("x",),);
    await expect(browserDecodeContent(encoded, "zstd",),).rejects.toThrow(/failed to decode/);
  },);
},);

// ── identity / gzip / brotli ───────────────────────────────────

describe("browserDecodeContent non-zstd paths", () => {
  test("identity returns stored string unchanged", async () => {
    expect(await browserDecodeContent("plain-text", "identity",),).toBe("plain-text",);
  },);

  test("empty stored returns empty", async () => {
    expect(await browserDecodeContent("", "gzip",),).toBe("",);
  },);

  test("gzip round-trips through CompressionStream when available", async () => {
    const plaintext = "hello gzip world".repeat(20,);
    const encoded = await browserEncodeContent(plaintext, "gzip",);
    if (encoded.encoding === "identity") {
      // CompressionStream unavailable in this runtime — identity is the
      // documented fallback, not a decode failure.
      return;
    }
    expect(encoded.encoding,).toBe("gzip",);
    expect(await browserDecodeContent(encoded.encoded, "gzip",),).toBe(plaintext,);
  },);
},);

