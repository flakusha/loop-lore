/**
 * Tests for transport protocol negotiation.
 *
 * Pure functions — no I/O, no mocks needed.
 */
import { describe, expect, test, } from "bun:test";
import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import {
  DEFAULT_CAPABILITIES,
  negotiate,
  parseAcceptEncoding,
  parseAcceptProtocols,
  parseExtensions,
  type ServerCapabilities,
} from "./negotiation";

// ── Test Request Helper ───────────────────────────────────────

function makeRequest(headers: Record<string, string> = {},): Request {
  return new Request("http://localhost/", { headers: new Headers(headers,), },);
}

// ── parseAcceptProtocols ──────────────────────────────────────

describe("parseAcceptProtocols", () => {
  test("parses simple protocol list", () => {
    const result = parseAcceptProtocols("http/1.1, http/2",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });

  test("respects quality values (q)", () => {
    const result = parseAcceptProtocols("http/1.1;q=0.5, http/2;q=1.0",);
    expect(result,).toEqual([TransportProtocol.Http2, TransportProtocol.Http1_1,],);
  });

  test("handles unknown protocols gracefully", () => {
    const result = parseAcceptProtocols("http/1.1, unknown/proto, http/2",);
    expect(result,).toEqual([TransportProtocol.Http1_1, TransportProtocol.Http2,],);
  });

  test("returns empty array for null/empty", () => {
    expect(parseAcceptProtocols(null,),).toEqual([],);
    expect(parseAcceptProtocols("",),).toEqual([],);
  });

  test("handles websocket and webtransport", () => {
    const result = parseAcceptProtocols("websocket, webtransport, http/1.1",);
    expect(result,).toEqual([
      TransportProtocol.WebSocket,
      TransportProtocol.WebTransport,
      TransportProtocol.Http1_1,
    ],);
  });

  test("handles http/3", () => {
    const result = parseAcceptProtocols("http/3, http/2",);
    expect(result,).toEqual([TransportProtocol.Http3, TransportProtocol.Http2,],);
  });
});

// ── parseAcceptEncoding ───────────────────────────────────────

describe("parseAcceptEncoding", () => {
  test("parses simple encoding list", () => {
    const result = parseAcceptEncoding("zstd, gzip, br",);
    expect(result,).toEqual([
      CompressionAlgorithm.Zstd,
      CompressionAlgorithm.Gzip,
      CompressionAlgorithm.Brotli,
    ],);
  });

  test("respects quality values", () => {
    const result = parseAcceptEncoding("gzip;q=0.5, zstd;q=1.0",);
    expect(result,).toEqual([CompressionAlgorithm.Zstd, CompressionAlgorithm.Gzip,],);
  });

  test("handles identity (no compression)", () => {
    const result = parseAcceptEncoding("identity, gzip",);
    expect(result,).toEqual([CompressionAlgorithm.None, CompressionAlgorithm.Gzip,],);
  });

  test("returns empty array for null/empty", () => {
    expect(parseAcceptEncoding(null,),).toEqual([],);
    expect(parseAcceptEncoding("",),).toEqual([],);
  });

  test("ignores unknown encodings", () => {
    const result = parseAcceptEncoding("zstd, unknown, gzip",);
    expect(result,).toEqual([CompressionAlgorithm.Zstd, CompressionAlgorithm.Gzip,],);
  });
});

// ── parseExtensions ───────────────────────────────────────────

describe("parseExtensions", () => {
  test("parses comma-separated extensions", () => {
    const result = parseExtensions("handshake/v1;param=1, compression/zstd",);
    expect(result,).toEqual(["handshake/v1", "compression/zstd",],);
  });

  test("handles single extension", () => {
    const result = parseExtensions("permessage-deflate",);
    expect(result,).toEqual(["permessage-deflate",],);
  });

  test("returns empty for null/empty", () => {
    expect(parseExtensions(null,),).toEqual([],);
    expect(parseExtensions("",),).toEqual([],);
  });

  test("trims whitespace", () => {
    const result = parseExtensions("  ext1 , ext2  ",);
    expect(result,).toEqual(["ext1", "ext2",],);
  });
});

// ── negotiate() ───────────────────────────────────────────────

describe("negotiate", () => {
  const defaultCaps: ServerCapabilities = { ...DEFAULT_CAPABILITIES, };

  test("defaults to http/1.1 when no Accept header", () => {
    const req = makeRequest({},);
    const result = negotiate(req, defaultCaps,);
    expect(result.protocol,).toBe(TransportProtocol.Http1_1,);
  });

  test("prefers first matching protocol from Accept header", () => {
    const req = makeRequest({ accept: "http/2, http/1.1", },);
    const result = negotiate(req, defaultCaps,);
    expect(result.protocol,).toBe(TransportProtocol.Http1_1,); // Only http/1.1 in default caps
  });

  test("selects http/2 when advertised and supported", () => {
    const caps: ServerCapabilities = {
      ...defaultCaps,
      protocols: [TransportProtocol.Http2, TransportProtocol.Http1_1,],
    };
    const req = makeRequest({ accept: "http/2, http/1.1", },);
    const result = negotiate(req, caps,);
    expect(result.protocol,).toBe(TransportProtocol.Http2,);
  });

  test("selects websocket when advertised and supported", () => {
    const caps: ServerCapabilities = {
      ...defaultCaps,
      protocols: [TransportProtocol.WebSocket, TransportProtocol.Http1_1,],
    };
    const req = makeRequest({ accept: "websocket, http/1.1", },);
    const result = negotiate(req, caps,);
    expect(result.protocol,).toBe(TransportProtocol.WebSocket,);
  });

  test("negotiates compression from Accept-Encoding", () => {
    const req = makeRequest({ "accept-encoding": "zstd, gzip", },);
    const result = negotiate(req, defaultCaps,);
    expect(result.compression,).toBe(CompressionAlgorithm.Zstd,);
  });

  test("defaults to none when no Accept-Encoding", () => {
    const req = makeRequest({},);
    const result = negotiate(req, defaultCaps,);
    expect(result.compression,).toBe(CompressionAlgorithm.None,);
  });

  test("falls back to gzip when zstd not supported", () => {
    const caps: ServerCapabilities = {
      ...defaultCaps,
      compression: [CompressionAlgorithm.Gzip,],
    };
    const req = makeRequest({ "accept-encoding": "zstd, gzip", },);
    const result = negotiate(req, caps,);
    expect(result.compression,).toBe(CompressionAlgorithm.Gzip,);
  });

  test("negotiates extensions from Sec-WebSocket-Extensions", () => {
    const req = makeRequest({ "sec-websocket-extensions": "permessage-deflate, handshake/v1", },);
    const caps: ServerCapabilities = {
      ...defaultCaps,
      extensions: ["handshake/v1", "compression/zstd",],
    };
    const result = negotiate(req, caps,);
    expect(result.extensions,).toContain("handshake/v1",);
    expect(result.extensions,).not.toContain("permessage-deflate",); // not in server caps
  });

  test("returns empty extensions when header missing", () => {
    const req = makeRequest({},);
    const result = negotiate(req, defaultCaps,);
    expect(result.extensions,).toEqual([],);
  });

  test("returns default maxFrameSize and maxPayload", () => {
    const req = makeRequest({},);
    const result = negotiate(req, defaultCaps,);
    expect(result.maxFrameSize,).toBe(0x1_00_00,);
    expect(result.maxPayload,).toBe(0x5_00_00,);
  });

  test("respects custom capabilities", () => {
    const caps: ServerCapabilities = {
      protocols: [TransportProtocol.Http2,],
      compression: [CompressionAlgorithm.Brotli,],
      maxFrameSize: 0x2_00_00,
      maxPayload: 0x10_00_00,
      extensions: ["custom/ext",],
    };
    const req = makeRequest({
      accept: "http/2",
      "accept-encoding": "br",
      "sec-websocket-extensions": "custom/ext",
    },);
    const result = negotiate(req, caps,);
    expect(result.protocol,).toBe(TransportProtocol.Http2,);
    expect(result.compression,).toBe(CompressionAlgorithm.Brotli,);
    expect(result.maxFrameSize,).toBe(0x2_00_00,);
    expect(result.maxPayload,).toBe(0x10_00_00,);
    expect(result.extensions,).toEqual(["custom/ext",],);
  });

  test("quality values affect protocol priority", () => {
    const caps: ServerCapabilities = {
      ...defaultCaps,
      protocols: [TransportProtocol.Http2, TransportProtocol.Http1_1,],
    };
    const req = makeRequest({ accept: "http/1.1;q=1.0, http/2;q=0.5", },);
    const result = negotiate(req, caps,);
    // Higher q wins despite http/2 being first in caps
    expect(result.protocol,).toBe(TransportProtocol.Http1_1,);
  });

  test("quality values affect compression priority", () => {
    const req = makeRequest({ "accept-encoding": "gzip;q=1.0, zstd;q=0.5", },);
    const result = negotiate(req, defaultCaps,);
    expect(result.compression,).toBe(CompressionAlgorithm.Gzip,);
  });
});
