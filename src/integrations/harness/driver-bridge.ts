// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * driver-bridge.ts — the BridgeRegistry view of a {@link HarnessDriver}.
 *
 * Wraps a driver in a {@link ProtocolAdapter} so harness chats ride the same
 * MessageBridge path as every other integration: target resolution through
 * src/integrations/registry, outbound moderation through
 * `createMessageBridge`'s `moderationGate` (reused, not re-implemented),
 * inbound turn text delivered through the bridge's `onMessage` handler.
 * Permission approval and cancel stay on the raw driver — the wrapper's
 * message surface cannot express them.
 */

import {
  type AdapterCapability,
  type AdapterMessageHandler,
  type ProtocolAdapter,
} from "../adapter";
import { type BridgeRegistry, type RegisterResult, } from "../registry";
import { HarnessAcpError, } from "./adapter-types";
import { type HarnessDriver, } from "./driver";
import { type HarnessTurnSink, } from "./turn-sink";

/** Wrapper options; `target` opts the driver into bridge target routing. */
export interface HarnessProtocolAdapterOptions {
  /** Registry name for the wrapper (also the default protocol id). */
  name: string;
  /** Protocol id; defaults to `name`. */
  protocol?: string;
  /** The one target the wrapper claims; absent → it never owns a target. */
  target?: string;
  /** Persists the turn and pushes its frames; absent → the turn is not persisted. */
  turnSink?: HarnessTurnSink;
}

/**
 * View a driver as a bridge-registerable protocol adapter. `sendMessage`
 * runs one prompt turn and delivers the response text through the
 * registered inbound handler; a failed turn throws so the bridge classifies
 * it as `send_failed`.
 * @param driver - the bound harness driver
 * @param options - name/protocol/target for the wrapper
 * @returns the adapter.
 */
export function createHarnessProtocolAdapter(
  driver: HarnessDriver,
  options: HarnessProtocolAdapterOptions,
): ProtocolAdapter {
  let connected = false;
  let handler: AdapterMessageHandler | null = null;

  return {
    name: options.name,
    protocol: options.protocol ?? options.name,
    async connect() {
      await driver.discoverModels();
      connected = true;
    },
    async disconnect() {
      connected = false;
      driver.close();
    },
    isConnected: () => connected,
    isEncrypted: () => false,
    capabilities: (): AdapterCapability[] => [],
    ownsTarget: options.target === undefined ? undefined : (target,) => target === options.target,
    async sendMessage(target, message,) {
      const result = await driver.runPrompt({ prompt: message.body, },);
      if (!result.ok) {
        throw new HarnessAcpError(result.kind, result.message,);
      }

      // Rows before delivery: a turn that cannot be persisted must not reach
      // the chat as if it had been recorded.
      await options.turnSink?.onTurnResolved(result.turn,);

      const id = `harness-${crypto.randomUUID()}`;
      handler?.({
        id,
        author: options.name,
        target,
        body: result.turn.text,
        timestamp: Date.now(),
      },);

      return id;
    },
    onMessage(newHandler,) {
      handler = newHandler;
    },
  };
}

/**
 * Build the driver's protocol-adapter view and register it.
 * @param registry - the bridge registry to register into
 * @param driver - the bound harness driver
 * @param options - name/protocol/target for the wrapper
 * @returns the register result (`duplicate_name` when taken).
 */
export function registerHarnessDriver(
  registry: BridgeRegistry,
  driver: HarnessDriver,
  options: HarnessProtocolAdapterOptions,
): RegisterResult {
  return registry.register(createHarnessProtocolAdapter(driver, options,),);
}
