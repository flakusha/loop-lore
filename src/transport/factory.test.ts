/**
 * Tests for transport factory and protocol handlers.
 */
import { describe, expect, test, } from "bun:test";
import { describe, expect, test, } from "bun:test";
import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import { compress, decompress, withCompression, } from "./compression";
import { compress, decompress, withCompression, } from "./compression";
import { TransportError, TransportErrorCode, } from "./errors";
import { createH2Handler, createHttp1Handler, createProtocol, createWsHandler, } from "./factory";
import { createH2Handler, createHttp1Handler, createProtocol, createWsHandler, } from "./factory";

// ── createProtocol / Factory ──────────────────────────────────

describe("createProtocol factory", () => {
  test("creates HTTP/1.1 handler", () => {
    const handler = createProtocol({ protocol: TransportProtocol.Http1_1, port: 3000, },);
    expect(handler,).toBeDefined();
    expect(typeof handler.connect,).toBe("function",);
  });

  test("creates HTTP/2 handler", () => {
    const handler = createProtocol({ protocol: TransportProtocol.Http2, port: 3000, },);
    expect(handler,).toBeDefined();
  });

  test("creates WebSocket handler", () => {
    const handler = createProtocol({ protocol: TransportProtocol.WebSocket, port: 3000, },);
    expect(handler,).toBeDefined();
  });

  test("throws for unsupported protocol (http/3)", () => {
    expect(() => createProtocol({ protocol: TransportProtocol.Http3, },)).toThrow(TransportError,);
    try {
      createProtocol({ protocol: TransportProtocol.Http3, },);
    } catch (error) {
      expect(error,).toBeInstanceOf(TransportError,);
      expect((error as TransportError).code,).toBe(TransportErrorCode.ProtocolUnsupported,);
      expect((error as TransportError).recoverable,).toBe(true,);
    }
  });

  test("throws for unsupported protocol (webtransport)", () => {
    expect(() => createProtocol({ protocol: TransportProtocol.WebTransport, },)).toThrow(TransportError,);
  });

  test("throws for unsupported protocol (tcp)", () => {
    expect(() => createProtocol({ protocol: TransportProtocol.Tcp, },)).toThrow(TransportError,);
  });

  test("throws for unsupported protocol (tls)", () => {
    expect(() => createProtocol({ protocol: TransportProtocol.Tls, },)).toThrow(TransportError,);
  });

  test("throws for unknown protocol string cast to unknown protocol", () => {
    expect(() => createProtocol({ protocol: "unknown" as TransportProtocol, },)).toThrow(TransportError,);
    try {
      createProtocol({ protocol: "unknown" as TransportProtocol, },);
    } catch (error) {
      expect(error,).toBeInstanceOf(TransportError,);
      expect((error as TransportError).code,).toBe(TransportErrorCode.ProtocolUnsupported,);
    }
  });
});

// ── Individual Handler Tests ──────────────────────────────────

describe("createHttp1Handler", () => {
  test("connects and returns proper connection", async () => {
    const handler = createHttp1Handler({ port: 3000, },);
    const conn = await handler.connect();
    expect(conn,).toBeDefined();
    expect(conn.id,).toBeTruthy();
    expect(conn.protocol,).toBe(TransportProtocol.Http1_1,);
    expect(conn.remoteAddr,).toBeTruthy();
    await handler.close();
  });

  test("connection has http/1.1 protocol", async () => {
    const handler = createHttp1Handler({},);
    const conn = await handler.connect();
    expect(conn.protocol,).toBe(TransportProtocol.Http1_1,);
    await handler.close();
  });

  test("connection metadata has keepAlive", async () => {
    const handler = createHttp1Handler({},);
    const conn = await handler.connect();
    expect(conn.metadata.keepAlive,).toBe(true,);
    await handler.close();
  });

  test("idempotent connect returns same connection", async () => {
    const handler = createHttp1Handler({},);
    const conn1 = await handler.connect();
    const conn2 = await handler.connect();
    expect(conn1.id,).toBe(conn2.id,);
    await handler.close();
  });

  test("throws after close", async () => {
    const handler = createHttp1Handler({},);
    await handler.connect();
    await handler.close();
    expect(() => handler.send("test",)).toThrow(TransportError,);
    expect(() => handler.get("test",)).toThrow(TransportError,);
  });
});

describe("createH2Handler", () => {
  test("connects and returns proper connection", async () => {
    const handler = createH2Handler({ port: 3000, },);
    const conn = await handler.connect();
    expect(conn,).toBeDefined();
    expect(conn.protocol,).toBe(TransportProtocol.Http2,);
    await handler.close();
  });

  test("connection has http/2 protocol", async () => {
    const handler = createH2Handler({},);
    const conn = await handler.connect();
    expect(conn.protocol,).toBe(TransportProtocol.Http2,);
    await handler.close();
  });

  test("connection metadata has multiplexing and serverPush", async () => {
    const handler = createH2Handler({ maxConcurrentStreams: 50, },);
    const conn = await handler.connect();
    expect(conn.metadata.multiplexing,).toBe(true,);
    expect(conn.metadata.serverPush,).toBe(true,);
    expect(conn.metadata.maxConcurrentStreams,).toBe(50,);
    await handler.close();
  });

  test("throws after close", async () => {
    const handler = createH2Handler({},);
    await handler.connect();
    await handler.close();
    expect(() => handler.send("test",)).toThrow(TransportError,);
    expect(() => handler.get("test",)).toThrow(TransportError,);
  });
});

describe("createWsHandler", () => {
  test("connects and returns proper connection (server mode)", async () => {
    const handler = createWsHandler({ port: 3000, },);
    const conn = await handler.connect();
    expect(conn,).toBeDefined();
    expect(conn.protocol,).toBe(TransportProtocol.WebSocket,);
    await handler.close();
  });

  test("connection has websocket protocol", async () => {
    const handler = createWsHandler({ port: 3000, },);
    const conn = await handler.connect();
    expect(conn.protocol,).toBe(TransportProtocol.WebSocket,);
    await handler.close();
  });

  test("connection metadata has pingPong", async () => {
    const handler = createWsHandler({ pingInterval: 15_000, },);
    const conn = await handler.connect();
    expect(conn.metadata.pingPong,).toBe(true,);
    expect(conn.metadata.pingInterval,).toBe(15_000,);
    await handler.close();
  });

  test("throws after close", async () => {
    const handler = createWsHandler({ port: 3000, },);
    await handler.connect();
    await handler.close();
    expect(() => handler.send("test",)).toThrow(TransportError,);
    expect(() => handler.get("test",)).toThrow(TransportError,);
  });
});

// ── Compression Wrapper ───────────────────────────────────────

describe("withCompression", () => {
  test("wraps handler and adds compression metadata", async () => {
    const base = createHttp1Handler({ port: 3000, },);
    const wrapped = withCompression({ handler: base, algorithm: CompressionAlgorithm.Zstd, },);

    const conn = await wrapped.connect();
    expect(conn.metadata.compression,).toBe(CompressionAlgorithm.Zstd,);
    await wrapped.close();
  });

  test("no compression when algorithm is none", async () => {
    const base = createHttp1Handler({ port: 3000, },);
    const wrapped = withCompression({ handler: base, algorithm: CompressionAlgorithm.None, },);

    const conn = await wrapped.connect();
    expect(conn.metadata.compression,).toBe(CompressionAlgorithm.None,);
    await wrapped.close();
  });

  test("compression is applied when creating protocol with compression config", async () => {
    const handler = createProtocol({
      protocol: TransportProtocol.Http1_1,
      compression: CompressionAlgorithm.Zstd,
      port: 3000,
    },);

    const conn = await handler.connect();
    expect(conn.metadata.compression,).toBe(CompressionAlgorithm.Zstd,);
    await handler.close();
  });
});

// ── Raw Compression Functions ─────────────────────────────────

describe("compress / decompress", () => {
  const testData = "Hello, this is test data for compression!".repeat(10,);
  const testBytes = new TextEncoder().encode(testData,);

  test("gzip compresses and decompresses correctly", () => {
    const compressed = compress(testBytes, CompressionAlgorithm.Gzip, { level: 6, },);
    const decompressed = decompress(compressed, CompressionAlgorithm.Gzip,);
    expect(new TextDecoder().decode(decompressed,),).toBe(testData,);
  });

  test("brotli compresses and decompresses correctly", () => {
    const compressed = compress(testBytes, CompressionAlgorithm.Brotli, { level: 6, },);
    const decompressed = decompress(compressed, CompressionAlgorithm.Brotli,);
    expect(new TextDecoder().decode(decompressed,),).toBe(testData,);
  });

  test("zstd compresses and decompresses correctly", () => {
    const compressed = compress(testBytes, CompressionAlgorithm.Zstd, { level: 3, },);
    const decompressed = decompress(compressed, CompressionAlgorithm.Zstd,);
    expect(new TextDecoder().decode(decompressed,),).toBe(testData,);
  });

  test("none returns original data", () => {
    const result = compress(testBytes, CompressionAlgorithm.None, {},);
    expect(result,).toBe(testBytes,);
    const decompressed = decompress(testBytes, CompressionAlgorithm.None,);
    expect(decompressed,).toBe(testBytes,);
  });

  test("threshold prevents compression of small payloads", () => {
    const small = new Uint8Array([1, 2, 3,],);
    const compressed = compress(small, CompressionAlgorithm.Gzip, { threshold: 256, },);
    expect(compressed,).toBe(small,);
  });

  test("compresses when above threshold", () => {
    const large = new Uint8Array(300,).fill(65,); // 'A' repeated 300 times
    const compressed = compress(large, CompressionAlgorithm.Gzip, { threshold: 256, },);
    expect(compressed.length,).toBeLessThan(large.length,);
  });
});

// ── Error Types ───────────────────────────────────────────────

describe("TransportError", () => {
  test("creates error with message", () => {
    const error = new TransportError("Connection failed",);
    expect(error.message,).toBe("Connection failed",);
    expect(error.name,).toBe("TransportError",);
  });

  test("includes error code", () => {
    const error = new TransportError("Not supported", { code: TransportErrorCode.ProtocolUnsupported, },);
    expect(error.code,).toBe(TransportErrorCode.ProtocolUnsupported,);
  });

  test("includes recoverable flag", () => {
    const error = new TransportError("Temporary", { recoverable: true, },);
    expect(error.recoverable,).toBe(true,);
  });

  test("defaults to not recoverable", () => {
    const error = new TransportError("Permanent",);
    expect(error.recoverable,).toBe(false,);
  });

  test("preserves cause", () => {
    const cause = new Error("Root cause",);
    const error = new TransportError("Wrapped", { cause, },);
    expect(error.cause,).toBe(cause,);
  });
});
