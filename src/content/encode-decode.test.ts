import { describe, expect, test, } from "bun:test";
import { decodeContent, } from "./decode";
import { encodeContent, } from "./encode";

const TEST_SAMPLES: { text: string; label: string }[] = [
  { text: "", label: "(empty)", },
  { text: "short", label: "short", },
  { text: "hello world", label: "hello world", },
  { text: "a".repeat(1000,), label: "a".repeat(20,) + "...", },
  { text: "The quick brown fox jumps over the lazy dog. ".repeat(10,), label: "The quick brown fox ...", },
  { text: JSON.stringify({ nested: { object: true, }, arr: [1, 2, 3,], },), label: '{"nested":{"object":...', },
];

describe("encode/decode round-trip", () => {
  for (const { text, label, } of TEST_SAMPLES) {
    for (const encoding of ["identity", "gzip", "brotli",] as const) {
      test(`${encoding}: ${label}`, () => {
        const encoded = encodeContent(text, encoding,);
        // Empty strings always return identity (design choice)
        const expectedEncoding = text === "" ? "identity" : encoding;
        expect(encoded.encoding,).toBe(expectedEncoding,);
        const decoded = decodeContent(encoded.encoded, encoding,);
        expect(decoded,).toBe(text,);
      });
    }
  }

  test("zstd round-trip", () => {
    // zstd requires specific Bun APIs — test as available
    const sample = "test data for zstd compression";
    const encoded = encodeContent(sample, "zstd",);
    expect(encoded.encoding,).toBe("zstd",);
    const decoded = decodeContent(encoded.encoded, "zstd",);
    expect(decoded,).toBe(sample,);
  });
});

describe("encodeContent edge cases", () => {
  test("identity passthrough returns same string", () => {
    const result = encodeContent("hello", "identity",);
    expect(result.encoded,).toBe("hello",);
    expect(result.encoding,).toBe("identity",);
  });

  test("empty string returns identity encoding regardless of requested encoding", () => {
    const result = encodeContent("", "gzip",);
    expect(result.encoding,).toBe("identity",);
    expect(result.encoded,).toBe("",);
  });

  test("gzip output is base64-encoded (alphanumeric + / + =)", () => {
    const result = encodeContent("Hello, World!", "gzip",);
    expect(/^[A-Za-z0-9+/=]+$/.test(result.encoded,),).toBe(true,);
  });

  test("brotli output differs from input (compressed)", () => {
    const result = encodeContent("This is a test string that should compress", "brotli",);
    expect(result.encoded,).not.toBe("This is a test string that should compress",);
  });
});

describe("decodeContent edge cases", () => {
  test("identity passthrough returns same string", () => {
    expect(decodeContent("hello", "identity",),).toBe("hello",);
  });

  test("empty string returns empty string for any encoding", () => {
    expect(decodeContent("", "identity",),).toBe("",);
    expect(decodeContent("", "gzip",),).toBe("",);
    expect(decodeContent("", "brotli",),).toBe("",);
    expect(decodeContent("", "zstd",),).toBe("",);
  });

  test("round-trip with large content preserves integrity", () => {
    const large = "x".repeat(50_000,);
    const encoded = encodeContent(large, "gzip",);
    expect(encoded.encoded.length,).toBeLessThan(large.length,); // should compress
    const decoded = decodeContent(encoded.encoded, "gzip",);
    expect(decoded,).toBe(large,);
  });

  test("round-trip preserves unicode", () => {
    const unicode = "Hello 世界 🌍 Привет 日本語";
    const encoded = encodeContent(unicode, "brotli",);
    const decoded = decodeContent(encoded.encoded, "brotli",);
    expect(decoded,).toBe(unicode,);
  });
});
