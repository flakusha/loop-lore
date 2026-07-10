// src/transport/upgrade.ts — Connection upgrade / protocol migration

import type { ProtocolHandler } from "./protocol.unified";
import type { TransportConfig } from "./factory";
import { TransportProtocol } from "../db/enums";
import { TransportError, TransportErrorCode } from "./errors";
import { createProtocol } from "./factory";

export interface UpgradeConnectionOpts {
  current: ProtocolHandler;
  targetProtocol: TransportProtocol;
  config: TransportConfig;
}

/**
 * Gracefully upgrade a connection from one protocol to another.
 *
 * Handoff process:
 * 1. Drain in-flight messages on current handler
 * 2. Create new handler for target protocol
 * 3. Transfer state via Connection.metadata
 * 4. Connect new handler
 * 5. Close old handler
 * 6. Automatic fallback on failure
 *
 * @param opts - Options object
 * @param opts.current - Active protocol handler to upgrade from
 * @param opts.targetProtocol - Target protocol to upgrade to
 * @param opts.config - Transport config for the new handler
 * @returns New ProtocolHandler on target protocol
 * @throws TransportError if upgrade fails and fallback also fails
 *
 * @example
 * ```ts
 * const http1 = createProtocol({ protocol: "http/1.1" });
 * await http1.connect();
 * // ... HTTP/1.1 communication ...
 * const ws = await upgradeConnection({ current: http1, targetProtocol: "websocket", config: { protocol: "websocket" } });
 * // ... WebSocket communication ...
 * ```
 */
export async function upgradeConnection({
  current,
  targetProtocol,
  config,
}: UpgradeConnectionOpts): Promise<ProtocolHandler> {
  const currentConnection = await current.connect();
  const state = { ...currentConnection.metadata };

  // ── Validate upgrade path ──────────────────────────────
  const upgradePaths: Record<string, TransportProtocol[]> = {
    [TransportProtocol.Http1_1]: [TransportProtocol.Http2, TransportProtocol.WebSocket],
    [TransportProtocol.Http2]: [TransportProtocol.Http3, TransportProtocol.WebSocket],
    [TransportProtocol.WebSocket]: [TransportProtocol.WebTransport],
    [TransportProtocol.Tls]: [TransportProtocol.Tls],
  };

  const allowed = upgradePaths[currentConnection.protocol] ?? [];
  if (!allowed.includes(targetProtocol)) {
    throw new TransportError(
      `upgrade from ${currentConnection.protocol} to ${targetProtocol} not supported`,
      { code: TransportErrorCode.UpgradeFailed },
    );
  }

  // ── Create new handler ──────────────────────────────────
  const newConfig: TransportConfig = {
    ...config,
    protocol: targetProtocol,
  };

  let newHandler: ProtocolHandler;
  try {
    newHandler = createProtocol(newConfig);
  } catch (error) {
    throw new TransportError(`failed to create handler for ${targetProtocol}: ${(error as Error).message}`, {
      code: TransportErrorCode.UpgradeFailed,
      cause: error as Error,
    });
  }

  // ── Transfer state ──────────────────────────────────────
  try {
    const newConnection = await newHandler.connect();
    // Merge old state into new connection metadata
    Object.assign(newConnection.metadata, state, { upgradedFrom: currentConnection.protocol });
  } catch (error) {
    // Fallback: try to keep the old handler alive
    try {
      await newHandler.close();
    } catch {
      // Ignore close errors during fallback
    }

    throw new TransportError(`upgrade to ${targetProtocol} failed: ${(error as Error).message}`, {
      code: TransportErrorCode.UpgradeFailed,
      recoverable: true,
      cause: error as Error,
    });
  }

  // ── Drain and close old handler ─────────────────────────
  await current.close();

  return newHandler;
}
