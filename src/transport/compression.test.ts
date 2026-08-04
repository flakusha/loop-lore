/**
 * Tests for the transparent compression decorator and its sync helpers
 * (src/transport/compression.ts). Pure module over node:zlib + Bun zstd.
 */
import { describe, expect, test, } from "bun:test";
import { compress, decompress, } from "./compression";

type Algorithm = "zstd" | "br" | "gzip" | "none";

/** Larger-than-default-threshold payload so compression actually engages. */
function payload(size = 2000,): Uint8Array {
  const bytes = new Uint8Array(size,);
  for (let i = 0; i < size; i++) { bytes[i] = i % 256; }
  return bytes;
}

function toText(data: Uint8Array,): string {
  return new TextDecoder().decode(data,);
}

describe.each(["zstd", "br", "gzip",] as Algorithm[],)("compress/decompress round-trip (%s)", (algo,) => {
  test("round-trips a payload back to the original bytes", () => {
    const original = payload();
    const compressed = compress(original, algo, { threshold: 256, },);
    const result = decompress(compressed, algo,);
    expect(result,).toEqual(original,);
  });

  test("actually compresses the data (output smaller than input)", () => {
    const original = payload(4000,);
    const compressed = compress(original, algo, { threshold: 256, },);
    expect(compressed.byteLength,).toBeLessThan(original.byteLength,);
  });

  test("decompresses the compressed bytes back to text", () => {
    const bytes = new TextEncoder().encode("hello compression world",);
    const compressed = compress(bytes, algo, { threshold: 1, },);
    expect(toText(decompress(compressed, algo,),),).toBe("hello compression world",);
  });
},);

describe("threshold behavior", () => {
  test("returns the input unchanged below the threshold", () => {
    const small = new TextEncoder().encode("tiny",);
    const result = compress(small, "gzip", { threshold: 256, },);
    expect(result,).toBe(small,);
  });

  test("skips compression when threshold is 0-sized but data is empty", () => {
    const empty = new Uint8Array(0,);
    // `byteLength < threshold` is true for empty input → passthrough
    const result = compress(empty, "gzip", { threshold: 1, },);
    expect(result,).toBe(empty,);
  });
});

describe("'none' algorithm", () => {
  test("compress passthroughs the input untouched", () => {
    const input = payload();
    expect(compress(input, "none", { threshold: 1, },),).toBe(input,);
  });

  test("decompress passthroughs the input untouched", () => {
    const input = payload();
    expect(decompress(input, "none",),).toBe(input,);
  });
});

describe("size cap (safeFromUint8Array)", () => {
  test("throws when compressing input over the 10MB buffer cap", () => {
    // safeFromUint8Array caps the input buffer at 10MB. An input over the
    // cap is rejected before compression runs.
    const big = new Uint8Array(11 * 1024 * 1024,);
    expect(big.byteLength,).toBeGreaterThan(10 * 1024 * 1024,);
    expect(() => compress(big, "gzip", { threshold: 0, },)).toThrow();
  });

  test("does not reject a payload just under the 10MB cap", () => {
    const near = new Uint8Array(10 * 1024 * 1024,);
    const result = compress(near, "gzip", { threshold: 0, },);
    expect(result.byteLength,).toBeGreaterThan(0,);
  });
});

describe("mismatched algorithm", () => {
  test("decompressing with the wrong algorithm throws", () => {
    const original = payload();
    const gzip = compress(original, "gzip", { threshold: 256, },);
    expect(() => decompress(gzip, "br",)).toThrow();
  });
});
