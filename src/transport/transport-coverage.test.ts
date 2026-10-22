// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Real coverage for the transport layer (ticket TASK-2026-020 / git 3234406).
 *
 * Everything here is in-process: handlers are exercised through their public
 * API against in-memory doubles and a temp-file-free compression pipeline.
 * No sockets, no fixed ports, no fixed filesystem paths; each test builds its
 * own handlers/doubles and nothing leaks between tests (order-independent).
 *
 * Resource contract: no shared mutable state, no external resources; each
 * test constructs its own handlers and relies on nothing from prior tests.
 */
import { describe, expect, test, } from "bun:test";
import { TransportProtocol, } from "../db/enums";
import { TransportBase, } from "./base";
import { compress, decompress, withCompression, } from "./compression";
import { TransportError, TransportErrorCode, } from "./errors";
import { H2Handler, } from "./h2";
import { Http1Handler, } from "./http1";
import type { Connection, ProtocolHandler, } from "./protocol.unified";
import { buildDefaultTests, validateProtocol, } from "./test/harness";

/**
 * These guard paths throw synchronously (before returning a promise), so the
 * throw is captured manually and asserted as a typed TransportError.
 */
function capture(fn: () => unknown,): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe("transport base — connection lifecycle (TransportBase)", () => {
  /** Minimal concrete subclass: protocol + metadata pinned, send recorded. */
  class RecordingTransport extends TransportBase {
    sent: (string | Uint8Array)[] = [];

    protected getProtocol(): TransportProtocol {
      return TransportProtocol.Http1_1;
    }

    protected getMetadata(): Record<string, unknown> {
      return { keepAlive: true, label: "rec", };
    }

    override async send(data: string | Uint8Array,): Promise<void> {
      this.ensureConnected();
      this.sent.push(data,);
    }
  }

  test("connect builds a connection with id, protocol, remoteAddr and metadata", async () => {
    const t = new RecordingTransport({ host: "example.test", port: 8443, },);
    const conn = await t.connect();
    expect(conn.protocol,).toBe(TransportProtocol.Http1_1,);
    expect(conn.remoteAddr,).toBe("example.test:8443",);
    expect(conn.metadata,).toEqual({ keepAlive: true, label: "rec", },);
    expect(conn.id,).toMatch(/[0-9a-f-]{36}/,);
  });

  test("connect is idempotent — same connection object on repeated calls", async () => {
    const t = new RecordingTransport({},);
    const a = await t.connect();
    const b = await t.connect();
    expect(b,).toBe(a,);
  });

  test("get returns string metadata and empty string for absent/non-string entries", async () => {
    const t = new RecordingTransport({},);
    await t.connect();
    expect(await t.get("keepAlive",),).toBe("",);
    expect(await t.get("label",),).toBe("rec",);
    expect(await t.get("missing",),).toBe("",);
  });

  test("get before connect throws TransportError ConnectionClosed", () => {
    const t = new RecordingTransport({},);
    const err = capture(() => t.get("label",));
    expect(err,).toBeInstanceOf(TransportError,);
    expect((err as TransportError).code,).toBe(TransportErrorCode.ConnectionClosed,);
  });

  test("close tears down: send/get refuse afterwards, connect re-creates", async () => {
    const t = new RecordingTransport({},);
    await t.connect();
    await t.close();
    await expect(t.send("x",),).rejects.toMatchObject({
      code: TransportErrorCode.ConnectionClosed,
    },);

    expect(capture(() => t.get("label",)),).toBeInstanceOf(TransportError,);
    // Known defect (asserted as-is): close() flips `closed` but connect()
    // never resets it, so a "reconnect" mints a fresh connection object yet
    // every call still refuses. Fixing that is a code change, not coverage.
    const fresh = await t.connect();
    expect(fresh.id,).not.toBeFalsy();
    expect(capture(() => t.get("label",)),).toBeInstanceOf(TransportError,);
  });
});

describe("transport handlers — non-sending stubs fail loudly", () => {
  test("Http1Handler.send throws ProtocolUnsupported once connected", async () => {
    const h = new Http1Handler({},);
    await h.connect();
    const err = capture(() => h.send("payload",)) as TransportError;
    expect(err.name,).toBe("TransportError",);
    expect(err.code,).toBe(TransportErrorCode.ProtocolUnsupported,);
    expect(err.recoverable,).toBe(false,);
  });

  test("H2Handler.send throws ProtocolUnsupported and reports H2 metadata", async () => {
    const h = new H2Handler({ maxConcurrentStreams: 7, },);
    const conn = await h.connect();
    expect(conn.protocol,).toBe(TransportProtocol.Http2,);
    expect(conn.metadata,).toEqual({
      multiplexing: true,
      serverPush: true,
      maxConcurrentStreams: 7,
    },);

    expect((capture(() => h.send(new Uint8Array([1,],),)) as TransportError).code,).toBe(
      TransportErrorCode.ProtocolUnsupported,
    );
  });

  test("H2Handler metadata defaults maxConcurrentStreams to 100", async () => {
    const h = new H2Handler({},);
    const conn = await h.connect();
    expect(conn.metadata.maxConcurrentStreams,).toBe(100,);
  });

  test("H2Handler.close clears stream state and refuses later sends", async () => {
    const h = new H2Handler({},);
    await h.connect();
    await h.close();
    expect((capture(() => h.send("x",)) as TransportError).code,).toBe(
      TransportErrorCode.ConnectionClosed,
    );
  });

  test("Http1Handler without a prior connect also refuses send (ConnectionClosed)", () => {
    const h = new Http1Handler({},);
    expect((capture(() => h.send("x",)) as TransportError).code,).toBe(
      TransportErrorCode.ConnectionClosed,
    );
  });
});

describe("transport test harness — validateProtocol + buildDefaultTests", () => {
  /** In-memory ProtocolHandler double: records everything it is sent. */
  function memoryHandler(): ProtocolHandler & { received: Uint8Array[] } {
    const received: Uint8Array[] = [];
    return {
      received,
      async connect(): Promise<Connection> {
        return {
          id: "mem-1",
          protocol: TransportProtocol.Http1_1,
          remoteAddr: "in-memory",
          metadata: {},
        };
      },
      async send(data: string | Uint8Array,): Promise<void> {
        received.push(typeof data === "string" ? new TextEncoder().encode(data,) : data,);
      },
      async get(): Promise<string> {
        return "";
      },
      async close(): Promise<void> {},
    } as ProtocolHandler & { received: Uint8Array[] };
  }

  test("buildDefaultTests sanity-checks payload types and sizes", async () => {
    const suite = buildDefaultTests();
    await expect(suite.sendRecv(["ok", "fine",],),).resolves.toBeUndefined();
    expect(capture(() => suite.sendRecv([42 as unknown as string,],)),).toBeInstanceOf(TypeError,);
    await expect(suite.backpressure(1024,),).resolves.toBeUndefined();
    expect(capture(() => suite.backpressure(0,)),).toBeInstanceOf(TypeError,);
    await expect(suite.connect(),).resolves.toBeUndefined();
    await expect(suite.reconnect(),).resolves.toBeUndefined();
  });

  test("validateProtocol reports passing and failing cases with durations", async () => {
    const handler = memoryHandler();
    const suite = buildDefaultTests();
    const report = await validateProtocol(handler, {
      connect: suite.connect,
      sendRecv: () => suite.sendRecv(["a",],),
      backpressure: () => suite.backpressure(-1,), // fails by contract
    },);

    expect(report.totalTests,).toBe(3,);
    expect(report.passed,).toBe(2,);
    expect(report.failed,).toBe(1,);
    expect(report.skipped,).toBe(0,);
    const failed = report.results.find((r,) => r.name === "backpressure");
    expect(failed?.passed,).toBe(false,);
    expect(failed?.error,).toContain("backpressure size must be > 0",);
    expect(report.results.every((r,) => r.durationMs >= 0),).toBe(true,);
  });

  test("validateProtocol captures thrown Error messages from the handler", async () => {
    const handler = memoryHandler();
    const report = await validateProtocol(handler, {
      connect: async () => {
        throw new Error("boom: handler unreachable",);
      },
    },);

    expect(report.failed,).toBe(1,);
    expect(report.results[0]?.error,).toBe("boom: handler unreachable",);
  });

  test("withCompression round-trips payloads through the inner handler", async () => {
    const inner = memoryHandler();
    const wrapped = withCompression({
      handler: inner as ProtocolHandler,
      algorithm: "gzip",
      options: { threshold: 8, },
    },);

    const conn = await wrapped.connect();
    expect(conn.metadata.compression,).toBe("gzip",);

    const payload = new TextEncoder().encode("compress me please, transport!",);
    await wrapped.send(payload,);
    expect(inner.received.length,).toBe(1,);
    expect(decompress(inner.received[0]!, "gzip",),).toEqual(payload,);

    await wrapped.close(); // delegates to the inner handler without throwing
  });

  test("withCompression forwards get() to the inner handler", async () => {
    const wrapped = withCompression({
      handler: {
        async connect() {
          return {
            id: "x",
            protocol: TransportProtocol.Http1_1,
            remoteAddr: "m",
            metadata: { tag: "v", },
          };
        },
        async send(): Promise<void> {},
        async get(signature: string,) {
          return signature === "tag" ? "v" : "";
        },
        async close(): Promise<void> {},
      } as ProtocolHandler,
      algorithm: "none",
    },);

    expect(await wrapped.get("tag",),).toBe("v",);
    expect(await wrapped.get("other",),).toBe("",);
  });
});

describe("compression — real round-trips and failure paths", () => {
  const PAYLOAD = new TextEncoder().encode(
    "lorem ipsum dolor sit amet, ".repeat(40,), // > default 256B threshold
  );

  test("zstd round-trip", () => {
    const zipped = compress(PAYLOAD, "zstd", {},);
    expect(zipped.byteLength,).toBeLessThan(PAYLOAD.byteLength,);
    expect(decompress(zipped, "zstd",),).toEqual(PAYLOAD,);
  });

  test("gzip round-trip with explicit level", () => {
    const zipped = compress(PAYLOAD, "gzip", { level: 9, },);
    expect(zipped.byteLength,).toBeLessThan(PAYLOAD.byteLength,);
    expect(decompress(zipped, "gzip",),).toEqual(PAYLOAD,);
  });

  test("brotli round-trip with quality param", () => {
    const zipped = compress(PAYLOAD, "br", { level: 5, },);
    expect(zipped.byteLength,).toBeLessThan(PAYLOAD.byteLength,);
    expect(decompress(zipped, "br",),).toEqual(PAYLOAD,);
  });

  test("payloads below the threshold pass through uncompressed", () => {
    const small = new Uint8Array([1, 2, 3,],);
    expect(compress(small, "gzip", { threshold: 256, },),).toBe(small,);
    expect(compress(small, "gzip", { threshold: 2, },).byteLength,).not.toBe(3,);
  });

  test("none algorithm is a pass-through in both directions at any size", () => {
    expect(compress(PAYLOAD, "none", {},),).toBe(PAYLOAD,);
    expect(decompress(PAYLOAD, "none",),).toBe(PAYLOAD,);
  });

  test("decompressing corrupt input throws instead of returning garbage", () => {
    const corrupt = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,],);
    for (const algo of ["gzip", "zstd", "br",] as const) {
      expect(() => decompress(corrupt, algo,)).toThrow();
    }
  });

  test("cross-algorithm decompress fails (gzip bytes are not zstd)", () => {
    const gz = compress(PAYLOAD, "gzip", {},);
    expect(() => decompress(gz, "zstd",)).toThrow();
  });
});
