// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Panel tests cover the two behaviours the settings pages depend on:
// the draft starts from the LAYER's own values (so an untouched
// inherited field is not written back as an override), and the save
// path targets the layer's own endpoint.
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { autonomyPanelFactory, } from "./autonomy-panel";

let calls: { url: string; method: string; body: string | null }[] = [];
let nextStatus = 200;
let nextPayload: unknown = {};

const LAYERS = {
  world: { preset: "brisk", },
  chat: { tickIntervalMs: 45_000, },
  actor: {},
};

const PAYLOAD = {
  layers: LAYERS,
  resolved: {
    preset: "brisk",
    enabled: true,
    tickIntervalMs: 10_000,
    jitterRatio: 0.2,
    perAgentCap: 4,
    perUserCap: 12,
  },
  presets: {
    serene: { tickIntervalMs: 90_000, jitterRatio: 0.5, perAgentCap: 2, },
    brisk: { tickIntervalMs: 10_000, jitterRatio: 0.1, perAgentCap: 6, },
  },

  actors: [{ id: "a1", name: "Ayla", }, { id: "a2", name: "Bryn", },],
  simulation: { paused: 0, tick_count: 7, next_tick_at: "2026-01-01T00:00:00Z", },
  budget: { cap: 12, remaining: 9, count: 3, resetAt: 1_800_000, },
};

beforeEach(() => {
  calls = [];
  nextStatus = 200;
  nextPayload = PAYLOAD;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit,) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, method: init?.method ?? "GET", body: (init?.body as string) ?? null, },);
    return Promise.resolve(
      new Response(JSON.stringify(nextPayload,), {
        status: nextStatus,
        headers: { "content-type": "application/json", },
      },),
    );
  }) as typeof fetch;
},);

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
},);

describe("autonomyPanelFactory", () => {
  test("loads the world scope when mounted on the world layer", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    expect(calls[0]?.url,).toBe("/api/worlds/w1/autonomy",);
    expect(state.autoData?.resolved.preset,).toBe("brisk",);
  });

  test("the draft holds only this layer's own values, never the merged ones", async () => {
    // The world layer stores a preset but not a tick interval. Seeding
    // the form from `resolved` would write an inherited interval back
    // as a world override, freezing the preset's tuning as an override.
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    expect(state.autoDraft,).toEqual({ preset: "brisk", },);
    expect(state.autoDraft.tickIntervalMs,).toBeUndefined();
    expect(state.autoDirty(),).toBe(false,);
  });

  test("the chat layer drafts from the chat override, not the world one", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", chatId: "c1", layer: "chat", },);
    await state.init();
    expect(calls[0]?.url,).toContain("chatId=c1",);
    expect(state.autoDraft,).toEqual({ tickIntervalMs: 45_000, },);
  });

  test("a failed load surfaces an error instead of a blank form", async () => {
    // feFetch throws before the panel sees a non-2xx status, so this
    // exercises the catch path, not the !res.ok branch.
    nextStatus = 500;
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    expect(state.autoError,).toBe("Failed to load autonomy settings",);
    expect(state.autoData,).toBeNull();
    expect(state.autoLoading,).toBe(false,);
  });

  test("saving the world layer PUTs the world, not the chat", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    state.autoDraft.perUserCap = 5;
    expect(state.autoDirty(),).toBe(true,);
    await state.save();
    const put = calls.find((c,) => c.method === "PUT");
    expect(put?.url,).toBe("/api/worlds/w1",);
    expect(JSON.parse(put?.body ?? "{}",).autonomyConfig,).toEqual({
      preset: "brisk",
      perUserCap: 5,
    },);
  });

  test("saving the chat layer PUTs the chat", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", chatId: "c1", layer: "chat", },);
    await state.init();
    state.autoDraft.preset = "serene";
    await state.save();
    expect(calls.find((c,) => c.method === "PUT")?.url,).toBe("/api/v1/chats/c1",);
  });

  test("the actor layer is read for the selected character only", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    expect(calls[0]?.url,).not.toContain("actorId",);

    state._autoActorId = "a1";
    await state.selectActor();
    expect(calls[1]?.url,).toContain("actorId=a1",);
  });

  test("saveActor writes the per-actor layer, not the world", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", actorId: "a1", },);
    await state.init();
    state.autoActorDraft.perUserCap = 2;
    expect(state.actorDirty(),).toBe(true,);
    expect(state.autoDirty(),).toBe(false,);

    await state.saveActor();
    const put = calls.find((c,) => c.method === "PUT");
    expect(put?.url,).toBe("/api/worlds/w1/autonomy/actor/a1",);
    expect(JSON.parse(put?.body ?? "",),).toEqual({ autonomy: { perUserCap: 2, }, },);
  });

  test("saveActor is a no-op with no character selected", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    await state.saveActor();
    expect(calls.filter((c,) => c.method === "PUT"),).toHaveLength(0,);
  });

  test("control posts to the loop and rereads it", async () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    await state.init();
    await state.control("pause",);
    const post = calls.find((c,) => c.method === "POST");
    expect(post?.url,).toBe("/api/worlds/w1/autonomy/control",);
    expect(JSON.parse(post?.body ?? "{}",).action,).toBe("pause",);
    // A POST that did not reread would leave the status line stale.
    expect(calls.filter((c,) => c.method === "GET").length,).toBe(2,);
  });

  test("the picker lists exactly the presets the server shipped", () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    state.autoData = { ...PAYLOAD, } as never;
    expect(state.presetNames(),).toEqual(["serene", "brisk",],);
  });

  test("inheritedValue reports the effective value, and unlimited for null", () => {
    const state = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    state.autoData = { ...PAYLOAD, resolved: { ...PAYLOAD.resolved, perUserCap: null, }, } as never;
    expect(state.inheritedValue("tickIntervalMs",),).toBe("10s",);
    expect(state.inheritedValue("perUserCap",),).toBe("unlimited",);
  });

  test("two factories do not share a draft", async () => {
    const a = autonomyPanelFactory({ worldId: "w1", layer: "world", },);
    const b = autonomyPanelFactory({ worldId: "w2", layer: "world", },);
    await a.init();
    a.autoDraft.perUserCap = 99;
    await b.init();
    expect(b.autoDraft.perUserCap,).toBeUndefined();
  });
});
