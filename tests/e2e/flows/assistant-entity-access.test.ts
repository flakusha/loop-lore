// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant entity-access E2E: the epic's core command flow end-to-end —
 * chat → slash command (message-send → dispatchCommand) → response.
 * The confirm route is hit on its versioned path (/api/v1/chats/:id/create-
 * entity); the browser-facing /api/chats path 308-redirects there with the
 * method and body preserved, which the real frontend apiFetch follows.
 *
 * Covered: /rag-search, /rag-preview, /duplicate (+ confirm → persisted
 * character), /adapt (mock provider returns non-JSON → graceful rejection,
 * the honest negative path), the /adapt POSITIVE path (system-prompt-scripted
 * model JSON → preview → confirm → adapted entity persisted in the target
 * world), the adapt-entity confirm route persisting an adapted entity in the
 * TARGET world, the cross-user access guard, and quota exhaustion denying a
 * real command with no side effects.
 */
import { configureAssistantQuota, resetAssistantQuota, } from "@/assistant/quota/engine";
import { ASSISTANT_QUOTA_DEFAULTS, } from "@/config/sections/assistant";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

interface CommandReply {
  command?: string;
  systemMessage?: string;
  action?: string;
  actionPayload?: Record<string, unknown>;
}

describe("Assistant entity access E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let chatId: string;
  let sourceWorldId: string;
  let targetWorldId: string;
  let loreId: string;
  let actorId: string;

  /** Send one slash command through the real message-send path. */
  const sendCommand = async (content: string,): Promise<{ status: number; reply: CommandReply }> => {
    const res = await api.post<CommandReply>(`/api/v1/chats/${chatId}/messages`, {
      content,
      role: "user",
    },);

    return { status: res.status, reply: (res.data ?? {}) as CommandReply, };
  };

  beforeAll(async () => {
    // registerMock: the /adapt negative path needs the mock provider as default.
    server = await createTestServer({ auth: { required: true, }, }, true,);
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);

    const source = await api.post<{ id: string }>("/api/v1/worlds", { name: "Medieval Source", },);
    const target = await api.post<{ id: string }>("/api/v1/worlds", { name: "Cyberpunk Target", },);
    sourceWorldId = source.data!.id;
    targetWorldId = target.data!.id;

    await api.post(`/api/v1/worlds/${sourceWorldId}/lore-entries`, {
      key: "drowned_city",
      content: "The Drowned City lies beneath the tide.",
    },);

    // Resolve the row id from the table: the POST payload id shape is not
    // guaranteed to be the lore-row primary key.
    const loreRow = await server.db
      .selectFrom("world_lore_entries",)
      .select("id",)
      .where("world_id", "=", sourceWorldId,)
      .executeTakeFirst();

    loreId = loreRow!.id;

    const actor = await api.post<{ id: string }>("/api/v1/actors", {
      displayName: "Iria",
      actorType: "character",
      description: "A medieval guard.",
      personality: "Steadfast",
      appearance: "Chainmail armor",
      scenario: "Guards the tide gate.",
    },);

    actorId = actor.data!.id;

    // The actors POST route attributes the row to the caller, but the
    // ownership guards key on actors.owner_id — pin it explicitly.
    const owner = await server.db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", SEED.user.username,)
      .executeTakeFirst();

    await server.db
      .updateTable("actors",)
      .set({ owner_id: owner!.id, },)
      .where("id", "=", actorId,)
      .execute();

    const chat = await api.post<{ id: string }>("/api/v1/chats", {
      name: "Entity Access Chat",
      type: "direct",
      mode: "direct",
      worldId: sourceWorldId,
    },);

    chatId = chat.data!.id;
  },);

  afterAll(async () => {
    await server.close();
  },);

  test("/rag-search returns ranked lore over the chat's world", async () => {
    const { status, reply, } = await sendCommand("/rag-search drowned",);
    expect(status,).toBe(200,);
    expect(reply.command,).toBe("rag-search",);
    expect(reply.systemMessage,).toContain("Drowned City",);
  });

  test("/rag-preview renders the indexed document", async () => {
    const { status, reply, } = await sendCommand(`/rag-preview ${loreId}`,);
    expect(status,).toBe(200,);
    expect(reply.command,).toBe("rag-preview",);
    expect(reply.systemMessage,).toContain("The Drowned City lies beneath the tide.",);
  });

  test("/duplicate previews a character copy and the confirm persists it", async () => {
    const { status, reply, } = await sendCommand(`/duplicate character ${actorId} --as "Iria II"`,);
    expect(status,).toBe(200,);
    expect(reply.action,).toBe("duplicate-entity",);
    expect(reply.actionPayload?.name,).toBe("Iria II",);

    // The frontend confirm posts the previewed fields to the confirm route.
    const confirm = await api.post<{ id: string; kind: string; name: string }>(
      `/api/v1/chats/${chatId}/create-entity`,
      { kind: "character", data: reply.actionPayload?.fields, worldId: null, },
    );

    expect(confirm.status,).toBe(201,);
    expect(confirm.data!.name,).toBe("Iria II",);

    // Persisted and visible: the new actor row exists for the user.
    const row = await server.db
      .selectFrom("actors",)
      .select(["id", "display_name",],)
      .where("display_name", "=", "Iria II",)
      .executeTakeFirst();

    expect(row,).toBeTruthy();
  });

  test("/adapt degrades gracefully when the model returns unusable JSON", async () => {
    // The e2e mock provider returns its canned "Mock response content" — the
    // honest negative path: nothing persists, the user gets a clear message.
    const { status, reply, } = await sendCommand(`/adapt character ${actorId} --to ${targetWorldId}`,);
    expect(status,).toBe(200,);
    expect(reply.systemMessage,).toContain("Adaptation rejected",);
    expect(reply.action ?? null,).toBeNull();
  });

  test("adapt-entity confirm persists the adapted entity in the target world", async () => {
    // The frontend confirm for `adapt-entity` posts the adapted fields to the
    // SAME route — target-world ownership is re-checked server-side.
    const confirm = await api.post<{ id: string; name: string }>(
      `/api/v1/chats/${chatId}/create-entity`,
      {
        kind: "item",
        data: { name: "Neon Tide Charm", category: "armor", rarity: "legendary", description: "Cyberpunk-adapted.", },
        worldId: targetWorldId,
      },
    );

    expect(confirm.status,).toBe(201,);

    const items = await api.get<{ data: Array<{ id: string; name: string }> }>(
      `/api/v1/worlds/${targetWorldId}/items`,
    );

    expect(items.ok,).toBe(true,);
    expect(items.data!.data.some((item,) => item.name === "Neon Tide Charm"),).toBe(true,);
  });

  test("access guard: the caller cannot duplicate a world they do not own", async () => {
    // Seed a foreign-owned world directly (the guard is what's under test —
    // a second full session adds no signal over the ownership column).
    await server.db
      .insertInto("users",)
      .values({
        id: "00000000-0000-4000-b000-0000000000aa",
        username: "entityOther",
        display_name: "Entity Other",
        secret_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const foreignWorld = await server.db
      .insertInto("worlds",)
      .values({
        id: "00000000-0000-4000-b000-0000000000ab",
        owner_id: "00000000-0000-4000-b000-0000000000aa",
        name: "Foreign World",
      },)
      .returning("id",)
      .executeTakeFirst();

    const { status, reply, } = await sendCommand(`/duplicate world ${foreignWorld!.id}`,);
    expect(status,).toBe(200,);
    expect(reply.systemMessage,).toContain("not found or not owned by you",);
    expect(reply.action ?? null,).toBeNull();
  });

  test("/adapt previews the model's adaptation and the confirm persists it", async () => {
    // Positive LLM path: /adapt's completion is a NON-aux GenerateRequest, so
    // it is scripted through the mock provider's system-prompt snippet hook.
    const adaptedDescription = "A netrunner guard running the tide gate's security deck.";
    server.mockProvider!.setSystemReply(
      "adapting an entity to a new world",
      JSON.stringify({
        changes: [
          {
            field: "description",
            newValue: adaptedDescription,
            reason: "Cyberpunk Target runs on corporate arcologies.",
          },
          { field: "appearance", newValue: "Neon-lined tactical synthweave", reason: "Cyberpunk fashion", },
        ],
      },),
    );

    try {
      const { status, reply, } = await sendCommand(`/adapt character ${actorId} --to ${targetWorldId}`,);
      expect(status,).toBe(200,);
      expect(reply.action,).toBe("adapt-entity",);
      expect(reply.actionPayload?.targetWorldId,).toBe(targetWorldId,);

      const changes = reply.actionPayload?.changes as Array<{ field: string; oldValue: string | null }>;
      expect(changes.some((c,) => c.field === "description" && c.oldValue === "A medieval guard."),).toBe(true,);

      // The frontend confirm posts the adapted fields to the confirm route,
      // which re-checks target-world ownership server-side.
      const confirm = await api.post<{ id: string; kind: string; name: string }>(
        `/api/v1/chats/${chatId}/create-entity`,
        { kind: reply.actionPayload?.kind, data: reply.actionPayload?.fields, worldId: targetWorldId, },
      );

      expect(confirm.status,).toBe(201,);
      expect(confirm.data!.name,).toBe("Iria",);

      // The adapted entity is a NEW actor carrying the adapted field values.
      const adapted = await server.db
        .selectFrom("actors",)
        .select(["id", "display_name", "description",],)
        .where("description", "=", adaptedDescription,)
        .executeTakeFirst();

      expect(adapted,).toBeTruthy();
    } finally {
      // The scripted reply must not leak into the canned-content paths the
      // other suites rely on.
      server.mockProvider!.clearScriptedReplies();
    }
  });

  test("quota exhaustion denies commands before any work runs", async () => {
    // Phase-2 wiring: the engine's limits are config-driven, but the e2e
    // server runs in-process, so the test arms the runtime store directly.
    const owner = await server.db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", SEED.user.username,)
      .executeTakeFirst();

    resetAssistantQuota(owner!.id,);
    configureAssistantQuota({ windowMs: 60_000, limitPerWindow: 8, },);

    const actorsBefore = await server.db.selectFrom("actors",).select("id",).execute();

    try {
      // duplicate costs 2: exactly four previews fit the 8-unit window.
      for (let i = 0; i < 4; i++) {
        const { status, reply, } = await sendCommand(`/duplicate character ${actorId} --as "Quota Probe ${i}"`,);
        expect(status,).toBe(200,);
        expect(reply.systemMessage,).toContain("Duplicate preview",);
      }

      // The fifth command is denied pre-call: clear message, no preview action.
      const denied = await sendCommand(`/duplicate character ${actorId} --as "Quota Denied"`,);
      expect(denied.status,).toBe(200,);
      expect(denied.reply.systemMessage,).toContain("**Quota exceeded for `duplicate`.**",);
      expect(denied.reply.systemMessage,).toContain("Nothing ran",);
      expect(denied.reply.action ?? null,).toBeNull();

      // The window is per-user across operations: rag-preview is denied too.
      const deniedPreview = await sendCommand(`/rag-preview ${loreId}`,);
      expect(deniedPreview.reply.systemMessage,).toContain("**Quota exceeded for `rag-preview`.**",);
      expect(deniedPreview.reply.action ?? null,).toBeNull();

      // Denials persist nothing: the actor set is unchanged.
      const actorsAfter = await server.db.selectFrom("actors",).select("id",).execute();
      expect(actorsAfter.length,).toBe(actorsBefore.length,);
    } finally {
      configureAssistantQuota({
        windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
        limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
      },);
    }
  });
});
