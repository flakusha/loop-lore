/**
 * Tests for transport upgrade functionality.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { upgradeConnection } from "./upgrade";
import { createProtocol } from "./factory";
import { TransportProtocol } from "../db/enums";
import type { ProtocolHandler } from "./protocol.unified";
import { TransportError, TransportErrorCode } from "./errors";

describe("upgradeConnection", () => {
  let http1Handler: ProtocolHandler;
  let http2Handler: ProtocolHandler;
  let wsHandler: ProtocolHandler;

  beforeEach(async () => {
    http1Handler = createProtocol({ protocol: TransportProtocol.Http1_1, port: 3000 });
    http2Handler = createProtocol({ protocol: TransportProtocol.Http2, port: 3000 });
    wsHandler = createProtocol({ protocol: TransportProtocol.WebSocket, port: 3000 });

    await http1Handler.connect();
    await http2Handler.connect();
    await wsHandler.connect();
  });

  afterEach(async () => {
    await http1Handler.close();
    await http2Handler.close();
    await wsHandler.close();
  });

  test("upgrades http/1.1 to http/2", async () => {
    const newHandler = await upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.Http2, config: {
      protocol: TransportProtocol.Http2,
      port: 3000,
    } });

    const conn = await newHandler.connect();
    expect(conn.protocol).toBe(TransportProtocol.Http2);
    expect(conn.metadata.upgradedFrom).toBe(TransportProtocol.Http1_1);
    await newHandler.close();
  });

  test("upgrades http/1.1 to websocket", async () => {
    const newHandler = await upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.WebSocket, config: {
      protocol: TransportProtocol.WebSocket,
      port: 3000,
    } });

    const conn = await newHandler.connect();
    expect(conn.protocol).toBe(TransportProtocol.WebSocket);
    expect(conn.metadata.upgradedFrom).toBe(TransportProtocol.Http1_1);
    await newHandler.close();
  });

  test("upgrades http/2 to websocket", async () => {
    const newHandler = await upgradeConnection({ current: http2Handler, targetProtocol: TransportProtocol.WebSocket, config: {
      protocol: TransportProtocol.WebSocket,
      port: 3000,
    } });

    const conn = await newHandler.connect();
    expect(conn.protocol).toBe(TransportProtocol.WebSocket);
    expect(conn.metadata.upgradedFrom).toBe(TransportProtocol.Http2);
    await newHandler.close();
  });

  test("preserves state metadata during upgrade", async () => {
    // Add custom metadata to http1 handler
    const conn1 = await http1Handler.connect();
    Object.assign(conn1.metadata, { customKey: "customValue", sessionId: "sess-123" });

    const newHandler = await upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.Http2, config: {
      protocol: TransportProtocol.Http2,
      port: 3000,
    } });

    const conn2 = await newHandler.connect();
    expect(conn2.metadata.customKey).toBe("customValue");
    expect(conn2.metadata.sessionId).toBe("sess-123");
    expect(conn2.metadata.upgradedFrom).toBe(TransportProtocol.Http1_1);
    await newHandler.close();
  });

  test("closes old handler after upgrade", async () => {
    await upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.Http2, config: {
      protocol: TransportProtocol.Http2,
      port: 3000,
    } });

    // Old handler should be closed
    expect(() => http1Handler.send("test")).toThrow(TransportError);
    expect(() => http1Handler.get("test")).toThrow(TransportError);
  });

  test("throws for invalid upgrade path (http/1.1 to http/3)", async () => {
    expect(
      upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.Http3, config: {
        protocol: TransportProtocol.Http3,
        port: 3000,
      } }),
    ).rejects.toThrow(TransportError);

    try {
      await upgradeConnection({ current: http1Handler, targetProtocol: TransportProtocol.Http3, config: {
        protocol: TransportProtocol.Http3,
        port: 3000,
      } });
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError);
      expect((error as TransportError).code).toBe(TransportErrorCode.UpgradeFailed);
      expect((error as TransportError).message).toContain("not supported");
    }
  });

  test("throws for invalid upgrade path (websocket to http/1.1)", () => {
    expect(
      upgradeConnection({ current: wsHandler, targetProtocol: TransportProtocol.Http1_1, config: {
        protocol: TransportProtocol.Http1_1,
        port: 3000,
      } }),
    ).rejects.toThrow(TransportError);
  });

  test("wraps factory error in TransportError with UpgradeFailed code for unimplemented protocols", async () => {
    // Unimplemented protocols throw during factory creation
    try {
      await upgradeConnection({
        current: http1Handler,
        targetProtocol: TransportProtocol.Http3, // Not implemented
        config: { protocol: TransportProtocol.Http3, port: 3000 },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError);
      expect((error as TransportError).code).toBe(TransportErrorCode.UpgradeFailed);
    }
  });
});

// ── Upgrade Path Validation ───────────────────────────────────

describe("upgrade paths", () => {
  const implementedProtocols: TransportProtocol[] = [
    TransportProtocol.Http1_1,
    TransportProtocol.Http2,
    TransportProtocol.WebSocket,
  ];

  const upgradePaths: Partial<Record<TransportProtocol, TransportProtocol[]>> = {
    [TransportProtocol.Http1_1]: [TransportProtocol.Http2, TransportProtocol.WebSocket],
    [TransportProtocol.Http2]: [TransportProtocol.WebSocket],
    [TransportProtocol.WebSocket]: [],
  };

  for (const from of implementedProtocols) {
    const targets = upgradePaths[from] ?? [];
    test(`${from} can upgrade to ${targets.join(", ") || "(none)"}`, async () => {
      const handler = createProtocol({ protocol: from, port: 3000 });
      await handler.connect();

      for (const to of targets) {
        const newHandler = await upgradeConnection({ current: handler, targetProtocol: to, config: { protocol: to, port: 3000 } });
        const conn = await newHandler.connect();
        expect(conn.protocol).toBe(to);
        await newHandler.close();
      }

      await handler.close();
    });
  }
});
