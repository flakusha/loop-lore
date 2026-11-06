// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Driver ⇄ bridge integration tests: registerHarnessDriver into
 * createBridgeRegistry, message flow through createMessageBridge with its
 * own moderationGate (reused, not re-implemented), against the fake ACP
 * fixture. Per-test fixture + bridge; afterEach reaps everything.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { getOrCreateBuffer, removeBuffer, } from "../../generation/stream-buffer";
import { insertActors, } from "../../test-utils/insert-helpers";
import { type AdapterMessage, } from "../adapter";
import { createMessageBridge, type MessageBridge, type ModerationGate, } from "../bridge";
import { type BridgeRegistry, createBridgeRegistry, } from "../registry";
import { createHarnessDriver, type HarnessDriver, type HarnessDriverOptions, } from "./driver";
import { createHarnessProtocolAdapter, registerHarnessDriver, } from "./driver-bridge";
import { type FakeAcpEnv, } from "./fake-acp-server";
import { createHarnessFixture, type HarnessFixture, } from "./harness-fixture";
import { createHarnessTurnSink, type HarnessTurnSink, } from "./turn-sink";

const fixtures: HarnessFixture[] = [];
const drivers: HarnessDriver[] = [];

afterEach(async () => {
  while (drivers.length > 0) { drivers.pop()?.close(); }
  while (fixtures.length > 0) { await fixtures.pop()?.cleanup(); }
},);

interface Rig {
  bridge: MessageBridge;
  driver: HarnessDriver;
  fixture: HarnessFixture;
  registry: BridgeRegistry;
}

/** Open a fixture + driver, register it under `name`, and wire a bridge. */
async function openRig(
  server: FakeAcpEnv,
  name: string,
  options?: {
    moderationGate?: ModerationGate;
    driver?: Partial<HarnessDriverOptions>;
    turnSink?: (fixture: HarnessFixture,) => HarnessTurnSink;
  },
): Promise<Rig> {
  const fixture = await createHarnessFixture({ server, },);
  fixtures.push(fixture,);

  const driver = await createHarnessDriver({
    profile: name,
    command: fixture.server.argv,
    requestTimeoutMs: 5000,
    ...options?.driver,
  },);

  drivers.push(driver,);
  const registry = createBridgeRegistry();
  const registered = registerHarnessDriver(registry, driver, {
    name,
    target: `harness:${name}`,
    turnSink: options?.turnSink?.(fixture,),
  },);

  if (!registered.ok) { throw new Error(registered.message,); }
  const bridge = createMessageBridge(registry, { moderationGate: options?.moderationGate, },);
  return { bridge, driver, fixture, registry, };
}

/** An outbound chat message routed at the rig's target. */
function outbound(body: string,): AdapterMessage {
  return {
    id: "out-1",
    author: "user",
    target: "",
    body,
    timestamp: Date.now(),
  };
}

describe("registerHarnessDriver", () => {
  it("routes a bridge send through the driver and delivers the turn text", async () => {
    const rig = await openRig({ FAKE_REPLY: "harness says hi", }, "harness-test",);
    const received: AdapterMessage[] = [];
    rig.bridge.onMessage((message,) => received.push(message,));
    const adapter = rig.registry.get("harness-test",);
    if (!adapter) { throw new Error("adapter missing",); }
    adapter.onMessage((message,) => rig.bridge.receive("harness-test", message,));

    const result = await rig.bridge.send("harness:harness-test", outbound("ping",),);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.adapter,).toBe("harness-test",);

    expect(received,).toHaveLength(1,);
    expect(received[0]!.body,).toBe("harness says hi",);
    expect(received[0]!.author,).toBe("harness-test",);
    expect(received[0]!.target,).toBe("harness:harness-test",);
  });

  it("blocks a send at createMessageBridge's moderationGate before the harness sees it", async () => {
    const rig = await openRig({ FAKE_REPLY: "should not happen", }, "harness-test", {
      moderationGate: async () => ({ allowed: false, reason: "nsfw", }),
    },);

    const result = await rig.bridge.send("harness:harness-test", outbound("banned",),);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result,).toMatchObject({ code: "moderation_blocked", reason: "nsfw", },);
    expect(rig.fixture.server.readLog(),).toEqual([],);
  });

  it("classifies a failed turn as send_failed", async () => {
    const rig = await openRig({ FAKE_HANG: "1", }, "harness-test", {
      driver: { requestTimeoutMs: 200, },
    },);

    const result = await rig.bridge.send("harness:harness-test", outbound("ping",),);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("send_failed",);
  });

  it("refuses a second registration under the same name", async () => {
    const rig = await openRig({}, "harness-test",);
    const result = rig.registry.register({
      name: "harness-test",
      protocol: "harness",
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
      isConnected: () => true,
      isEncrypted: () => false,
      capabilities: () => [],
      sendMessage: () => Promise.resolve("x",),
      onMessage: () => undefined,
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("duplicate_name",);
  });

  it("connect probes model discovery and disconnect closes the driver", async () => {
    const rig = await openRig({ FAKE_MODELS: "m1", }, "harness-test",);
    const adapter = createHarnessProtocolAdapter(rig.driver, {
      name: "harness-test",
      target: "harness:harness-test",
    },);

    expect(adapter.isConnected(),).toBe(false,);
    await adapter.connect({},);
    expect(adapter.isConnected(),).toBe(true,);
    await adapter.disconnect();
    expect(adapter.isConnected(),).toBe(false,);
  });
});

describe("harness turn persistence", () => {
  const chatId = "chat-harness-bridge";
  const actorId = "actor-harness-bridge";
  const userId = "user-harness-bridge";

  afterEach(() => {
    removeBuffer(chatId,);
  },);

  /** Seed the user/actor/chat the harness rows hang off. */
  async function seedChat(fixture: HarnessFixture,): Promise<void> {
    await fixture.db.insertInto("users",).values({
      id: userId,
      username: "harness-bridge",
      display_name: "Harness Bridge",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    await insertActors(fixture.db, "Alice", {
      id: actorId,
      actor_type: "character",
      owner_id: userId,
      agent_type: "ai",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
    } as never,);

    await fixture.db.insertInto("chats",).values({
      id: chatId,
      name: "Harness Bridge",
      type: "direct",
      mode: "direct",
      created_by: userId,
      max_turns: null,
    } as never,).execute();
  }

  it("persists the turn as message rows and pushes its frames", async () => {
    const rig = await openRig(
      {
        FAKE_REPLY: "harness says hi",
        FAKE_EVENTS: JSON.stringify([
          { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking out loud", }, },
          { sessionUpdate: "tool_call", toolCallId: "tc-1", title: "grep", kind: "read", },
          {
            sessionUpdate: "tool_call_update",
            toolCallId: "tc-1",
            status: "completed",
            content: [{ type: "content", content: { type: "text", text: "one match", }, },],
          },
        ],),
      },
      "harness-test",
      {
        turnSink: (fixture,) =>
          createHarnessTurnSink({ database: fixture.db, chatId, actorId, profile: "harness-test", },),
      },
    );

    await seedChat(rig.fixture,);
    const buffer = getOrCreateBuffer(chatId,);

    const result = await rig.bridge.send("harness:harness-test", outbound("ping",),);

    expect(result.ok,).toBe(true,);
    const rows = await rig.fixture.db.selectFrom("messages",).selectAll().execute();
    const assistant = rows.find((row,) => row.content_type === "text");
    expect(assistant?.content,).toBe("harness says hi",);
    expect(JSON.parse(assistant?.thinking ?? "[]",),).toEqual(["thinking out loud",],);
    expect(JSON.parse(assistant?.tool_calls ?? "[]",),).toEqual([{
      id: "tc-1",
      type: "function",
      function: { name: "grep", arguments: "{}", },
    },],);

    const toolRow = rows.find((row,) => row.content_type === "tool_result");
    expect(toolRow?.content,).toBe("one match",);
    expect(toolRow?.parent_id,).toBe(assistant?.id,);
    const events = buffer.replay();
    expect(events.map((event,) => event.type),).toEqual([
      "harness-chunk",
      "harness-thinking",
      "harness-tool-call",
      "harness-tool-result",
      "harness-turn-end",
    ],);
  });

  it("persists nothing when the send is blocked before the harness runs", async () => {
    const rig = await openRig({ FAKE_REPLY: "should not happen", }, "harness-test", {
      moderationGate: async () => ({ allowed: false, reason: "nsfw", }),
      turnSink: (fixture,) =>
        createHarnessTurnSink({ database: fixture.db, chatId, actorId, profile: "harness-test", },),
    },);

    await seedChat(rig.fixture,);

    const result = await rig.bridge.send("harness:harness-test", outbound("banned",),);

    expect(result.ok,).toBe(false,);
    const rows = await rig.fixture.db.selectFrom("messages",).selectAll().execute();
    expect(rows,).toHaveLength(0,);
  });
});
