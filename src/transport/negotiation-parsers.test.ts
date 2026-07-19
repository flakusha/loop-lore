/**
 * Tests for negotiation header parsers.
 */
import { describe, expect, test, } from "bun:test";
import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import { parseAcceptEncoding, parseAcceptProtocols, parseExtensions, } from "./negotiation-parsers";

describe("parseAcceptProtocols", () => {
  test("parses single protocol", () => {
    const result = parseAcceptProtocols("http/1.1",);
    expect(result,).toEqual([TransportProtocol.Http1_1,],);
  });

  test("parses multiple protocols", () => {
    const result = parseAcceptProtocols("http/1.1, http/2",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });

  test("parses with quality values", () => {
    const result = parseAcceptProtocols("http/1.1;q=0.5, http/2;q=1.0",);
    expect(result,).toEqual([TransportProtocol.Http2, TransportProtocol.Http1_1,],);
  });

  test("parses websocket protocol", () => {
    const result = parseAcceptProtocols("websocket",);
    expect(result,).toEqual([TransportProtocol.WebSocket,],);
  });

  test("parses webtransport protocol", () => {
    const result = parseAcceptProtocols("webtransport",);
    expect(result,).toEqual([TransportProtocol.WebTransport,],);
  });

  test("parses http/3", () => {
    const result = parseAcceptProtocols("http/3",);
    expect(result,).toEqual([TransportProtocol.Http3,],);
  });

  test("ignores unknown protocols", () => {
    const result = parseAcceptProtocols("http/1.1, unknown/proto, http/2",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });

  test("handles whitespace", () => {
    const result = parseAcceptProtocols("  http/1.1 ,  http/2  ",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });

  test("handles empty string", () => {
    const result = parseAcceptProtocols("",);
    expect(result,).toEqual([],);
  });

  test("handles null", () => {
    const result = parseAcceptProtocols(null,);
    expect(result,).toEqual([],);
  });

  test("handles quality value of 0", () => {
    const result = parseAcceptProtocols("http/1.1;q=0, http/2;q=1",);
    // q=0 should still be included but at lowest priority
    expect(result,).toContain(TransportProtocol.Http1_1,);
    expect(result,).toContain(TransportProtocol.Http2,);
    expect(result[0],).toBe(TransportProtocol.Http2,);
  });

  test("handles malformed quality values gracefully", () => {
    const result = parseAcceptProtocols("http/1.1;q=invalid, http/2",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });
});

describe("parseAcceptEncoding", () => {
  test("parses single encoding", () => {
    const result = parseAcceptEncoding("gzip",);
    expect(result,).toEqual([CompressionAlgorithm.Gzip,],);
  });

  test("parses multiple encodings", () => {
    const result = parseAcceptEncoding("zstd, br, gzip",);
    expect(result,).toEqual([
      CompressionAlgorithm.Zstd,
      CompressionAlgorithm.Brotli,
      CompressionAlgorithm.Gzip,
    ],);
  });

  test("parses with quality values", () => {
    const result = parseAcceptEncoding("gzip;q=0.5, zstd;q=1.0",);
    expect(result,).toEqual([CompressionAlgorithm.Zstd, CompressionAlgorithm.Gzip,],);
  });

  test("parses identity (no compression)", () => {
    const result = parseAcceptEncoding("identity",);
    expect(result,).toEqual([CompressionAlgorithm.None,],);
  });

  test("handles identity among others", () => {
    const result = parseAcceptEncoding("gzip, identity, br",);
    expect(result,).toEqual([
      CompressionAlgorithm.Gzip,
      CompressionAlgorithm.None,
      CompressionAlgorithm.Brotli,
    ],);
  });

  test("ignores unknown encodings", () => {
    const result = parseAcceptEncoding("zstd, unknown, gzip",);
    expect(result,).toEqual([CompressionAlgorithm.Zstd, CompressionAlgorithm.Gzip,],);
  });

  test("handles whitespace", () => {
    const result = parseAcceptEncoding("  gzip ,  br  ",);
    expect(result,).toEqual([CompressionAlgorithm.Gzip, CompressionAlgorithm.Brotli,],);
  });

  test("handles empty string", () => {
    const result = parseAcceptEncoding("",);
    expect(result,).toEqual([],);
  });

  test("handles null", () => {
    const result = parseAcceptEncoding(null,);
    expect(result,).toEqual([],);
  });
});

describe("parseExtensions", () => {
  test("parses single extension", () => {
    const result = parseExtensions("permessage-deflate",);
    expect(result,).toEqual(["permessage-deflate",],);
  });

  test("parses multiple extensions", () => {
    const result = parseExtensions("ext1, ext2, ext3",);
    expect(result,).toEqual(["ext1", "ext2", "ext3",],);
  });

  test("removes parameters", () => {
    const result = parseExtensions("ext1;param=value, ext2;foo=bar",);
    expect(result,).toEqual(["ext1", "ext2",],);
  });

  test("handles whitespace", () => {
    const result = parseExtensions("  ext1 , ext2  ",);
    expect(result,).toEqual(["ext1", "ext2",],);
  });

  test("handles empty string", () => {
    const result = parseExtensions("",);
    expect(result,).toEqual([],);
  });

  test("handles null", () => {
    const result = parseExtensions(null,);
    expect(result,).toEqual([],);
  });

  test("handles extension with no parameter", () => {
    const result = parseExtensions("ext1;, ext2",);
    expect(result,).toEqual(["ext1", "ext2",],);
  });
});
