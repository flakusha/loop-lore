// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract tests for the ProtocolAdapter seam.
 *
 * A stub bridge proves the interface is implementable and that capability
 * narrowing works — no real protocol involved.
 */
import { describe, expect, test, } from "bun:test";
import {
  ADAPTER_CAPABILITIES,
  type AdapterCapability,
  type AdapterMessage,
  type AdapterMessageHandler,
  type ChannelCapable,
  type ProtocolAdapter,
} from "./adapter";

class StubAdapter implements ProtocolAdapter, ChannelCapable {
  readonly name = "stub";
  readonly protocol = "stub";
  readonly capability = "channels" as const;
  private connected = false;
  private handler: AdapterMessageHandler | null = null;

  async connect(_config: Record<string, unknown>,): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isEncrypted(): boolean {
    return false;
  }

  capabilities(): AdapterCapability[] {
    return ["channels",];
  }

  async sendMessage(target: string, message: Omit<AdapterMessage, "id" | "target">,): Promise<string> {
    if (!this.connected) { throw new Error("not connected",); }
    const inbound: AdapterMessage = { ...message, id: "echo-1", target, };
    this.handler?.(inbound,);
    return "echo-1";
  }

  onMessage(handler: AdapterMessageHandler,): void {
    this.handler = handler;
  }

  async listChannels(): Promise<{ id: string; name: string }[]> {
    return [{ id: "general", name: "General", },];
  }
}

describe("ProtocolAdapter seam", () => {
  test("stub bridge connects, sends, and echoes inbound", async () => {
    const adapter: ProtocolAdapter = new StubAdapter();
    expect(adapter.isConnected(),).toBe(false,);
    await adapter.connect({},);
    expect(adapter.isConnected(),).toBe(true,);
    expect(adapter.isEncrypted(),).toBe(false,);
    expect(adapter.capabilities(),).toEqual(["channels",],);
    const seen: AdapterMessage[] = [];
    adapter.onMessage((message,) => {
      seen.push(message,);
    },);
    const id = await adapter.sendMessage("general", {
      author: "tester",
      body: "hello",
      timestamp: Date.now(),
    },);
    expect(id,).toBe("echo-1",);
    expect(seen,).toHaveLength(1,);
    await adapter.disconnect();
    expect(adapter.isConnected(),).toBe(false,);
  });

  test("send while disconnected throws", async () => {
    const adapter = new StubAdapter();
    await expect(adapter.sendMessage("general", {
      author: "tester",
      body: "hello",
      timestamp: 0,
    },),).rejects.toThrow("not connected",);
  });

  test("capability narrowing exposes channel surface", async () => {
    const adapter: ProtocolAdapter = new StubAdapter();
    expect(adapter.capabilities(),).toContain("channels",);
    const channels = await (adapter as unknown as ChannelCapable).listChannels();
    expect(channels,).toEqual([{ id: "general", name: "General", },]);
  });

  test("capability registry covers the retired SocialAdapter surface", () => {
    expect(ADAPTER_CAPABILITIES,).toContain("channels",);
    expect(ADAPTER_CAPABILITIES,).toContain("presence",);
    expect(ADAPTER_CAPABILITIES,).toContain("reactions",);
    expect(ADAPTER_CAPABILITIES,).toContain("message-edit",);
  });
});
