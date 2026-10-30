// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-orchestration route tests.
 *
 * Exercises the whole HTTP surface through the Elysia app boundary against a
 * real in-memory SQLite DB: state snapshot, pause/resume, single GM turn,
 * configure, narration, and escalation. The LLM path uses a mock provider
 * registered in the real provider registry (no module mocking).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { TurnStatus, TurnType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatOwners,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertLocationStates,
  insertStoryTurns,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import { storyOrchestrationRoutes, } from "./index";

const PROVIDER = "story-orchestration-mock";
const USER_ID = "story-orch-user";
const MISSING_CHAT = "00000000-0000-4000-8000-000000000000";

/** Minimal app config: provider resolution + prompt templates the GM reads. */
const testConfig = {
  byoKey: { enabled: false, encryptionKey: "", },
  nsfw: { allowNsfw: false, },
  generation: {
    defaultProvider: PROVIDER,
    defaultModels: { [PROVIDER]: "mock-model", },
    providers: { openaiCompatible: [], },
  },
  templates: { llm: { systemPrompts: {}, }, },
} as unknown as Config;

/** Chat gm_config: LLM game master, so /step exercises the generateText path. */
const GM_CONFIG = JSON.stringify({
  type: "llm",
  llmConfig: {
    model: "mock-model",
    provider: PROVIDER,
    systemPrompt: "You are the Game Master.",
    temperature: 0.7,
    maxTokens: 256,
  },
},);

/** Unpaused story state so pause/resume round-trips are observable. */
const STORY_STATE = JSON.stringify({
  currentTurn: 0,
  currentActorId: null,
  turnOrder: [],
  strategy: "hybrid",
  isPaused: false,
  lastTurnCompletedAt: null,
  pendingRegeneration: null,
},);

/** @returns an Elysia app with the story-orchestration routes mounted. */
function makeApp(db: Kysely<DB>,) {
  return new Elysia({ name: "test-story-orchestration", },)
    .derive(() => ({ userId: USER_ID, userRole: "user" as const, }))
    .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);
}

/**
 * @param method - HTTP method
 * @param url - full request URL
 * @param body - optional JSON body
 * @returns request with a JSON content type when a body is supplied
 */
function request(method: string, url: string, body?: unknown,): Request {
  return new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json", }, body: JSON.stringify(body,), }),
  },);
}

describe("story-orchestration routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    registerProvider(PROVIDER, new MockLLMProvider(),);
    await insertUsers(db, "story-orch", "Story Orch", { id: USER_ID, },);
  },);

  afterAll(() => {
    unregisterProvider(PROVIDER,);
    sqlite.close();
  },);

  /** @returns world id with one location (and its state row) seeded. */
  async function seedWorld(): Promise<string> {
    const worldId = crypto.randomUUID();
    const locationId = crypto.randomUUID();
    await insertWorlds(db, USER_ID, "Orch World", { id: worldId, },);
    await insertLocations(db, worldId, "Tavern", { id: locationId, },);
    await insertLocationStates(db, locationId, worldId, { atmosphere: "cozy", },);
    return worldId;
  }

  /**
   * @param opts.worldId - world to attach; omit for a world-less chat
   * @param opts.storyState - raw story_state column value
   * @returns chat id
   */
  async function seedChat(opts?: { worldId?: string | null; storyState?: string | null },): Promise<string> {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Orch Chat", USER_ID, {
      id: chatId,
      mode: "story",
      world_id: opts?.worldId ?? null,
      gm_config: GM_CONFIG,
      story_state: opts?.storyState ?? STORY_STATE,
    },);

    return chatId;
  }

  /**
   * @param chatId
   * @returns actor id participating in the chat
   */
  async function seedParticipant(chatId: string,): Promise<string> {
    const actorId = crypto.randomUUID();
    await insertActors(db, "Goblin", { id: actorId, },);
    await insertChatParticipants(db, chatId, actorId,);
    return actorId;
  }

  test("GET /story/state reports the turn snapshot", async () => {
    const chatId = await seedChat();
    const res = await makeApp(db,).handle(new Request(`http://localhost/api/v1/chats/${chatId}/story/state`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      chatId: string;
      currentTurn: number;
      isPaused: boolean;
      isComplete: boolean;
    };

    expect(body.chatId,).toBe(chatId,);
    expect(body.currentTurn,).toBe(0,);
    expect(body.isPaused,).toBe(false,);
    expect(body.isComplete,).toBe(false,);
  });

  test("GET /story/state 404s for an unknown chat", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/v1/chats/${MISSING_CHAT}/story/state`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /story/pause then /story/resume flip the persisted pause flag", async () => {
    const chatId = await seedChat();
    const app = makeApp(db,);

    const paused = await app.handle(request("POST", `http://localhost/api/v1/chats/${chatId}/story/pause`,),);
    expect(paused.status,).toBe(200,);
    expect((await paused.json() as { ok: boolean; isPaused: boolean }).isPaused,).toBe(true,);

    const resumed = await app.handle(request("POST", `http://localhost/api/v1/chats/${chatId}/story/resume`,),);
    expect(resumed.status,).toBe(200,);
    expect((await resumed.json() as { ok: boolean; isPaused: boolean }).isPaused,).toBe(false,);

    const state = await app.handle(new Request(`http://localhost/api/v1/chats/${chatId}/story/state`,),);
    expect((await state.json() as { isPaused: boolean }).isPaused,).toBe(false,);
  });

  test("POST /story/pause 404s for an unknown chat", async () => {
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${MISSING_CHAT}/story/pause`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /story/step runs a turn through the registered provider", async () => {
    const worldId = await seedWorld();
    const chatId = await seedChat({ worldId, },);
    const actorId = await seedParticipant(chatId,);

    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/step`, { forceActorId: actorId, },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { turnId: string; actorId: string; response: string | null };
    expect(body.actorId,).toBe(actorId,);
    expect(body.turnId,).toBeString();

    const turns = await db.selectFrom("story_turns",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(turns,).toHaveLength(1,);
    expect(turns[0]!.id,).toBe(body.turnId,);
  });

  test("POST /story/configure persists strategy, maxTurns and thresholds", async () => {
    const chatId = await seedChat();
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/configure`, {
        turnStrategy: "round_robin",
        maxTurns: 12,
        qualityThresholds: { coherence: 0.5, roleplay: 0.75, },
      },),
    );

    expect(res.status,).toBe(200,);
    expect((await res.json() as { ok: boolean }).ok,).toBe(true,);

    const chat = await db
      .selectFrom("chats",)
      .select(["turn_strategy", "max_turns", "gm_config",],)
      .where("id", "=", chatId,)
      .executeTakeFirstOrThrow();

    expect(chat.turn_strategy,).toBe("round_robin",);
    expect(chat.max_turns,).toBe(12,);
    expect(chat.gm_config,).toContain('"coherence":0.5',);
  });

  test("POST /story/configure rejects an unknown turn strategy (422)", async () => {
    const chatId = await seedChat();
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/configure`, { turnStrategy: "nonsense", },),
    );

    expect(res.status,).toBe(422,);
  });

  test("POST /story/configure 404s for an unknown chat", async () => {
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${MISSING_CHAT}/story/configure`, {},),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /story/narration injects a beat for a world-backed chat", async () => {
    const worldId = await seedWorld();
    const chatId = await seedChat({ worldId, },);
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/narration`, { text: "The door creaks.", },),
    );

    expect(res.status,).toBe(200,);
    expect((await res.json() as { ok: boolean }).ok,).toBe(true,);
  });

  test("POST /story/narration rejects a chat without a world (400)", async () => {
    const chatId = await seedChat();
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/narration`, { text: "hi", },),
    );

    expect(res.status,).toBe(400,);
  });

  test("POST /gm/escalate escalates the latest open turn", async () => {
    const chatId = await seedChat();
    const actorId = await seedParticipant(chatId,);
    const turnId = crypto.randomUUID();
    await insertStoryTurns(db, chatId, 1, actorId, TurnType.CharacterAction, "prompt", {
      id: turnId,
      status: TurnStatus.Pending,
    },);

    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/gm/escalate`,),
    );

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toMatchObject({ ok: true, turnId, status: TurnStatus.Escalated, },);

    const turn = await db
      .selectFrom("story_turns",)
      .select("status",)
      .where("id", "=", turnId,)
      .executeTakeFirstOrThrow();

    expect(turn.status,).toBe(TurnStatus.Escalated,);
  });

  test("POST /gm/escalate 404s when no open turn exists", async () => {
    const chatId = await seedChat();
    const actorId = await seedParticipant(chatId,);
    await insertStoryTurns(db, chatId, 1, actorId, TurnType.CharacterAction, "prompt", {
      status: TurnStatus.Accepted,
    },);

    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/gm/escalate`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /gm/escalate 404s for an unknown chat", async () => {
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${MISSING_CHAT}/gm/escalate`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("GET /story/state returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(new Request(`http://localhost/api/v1/chats/${chatId}/story/state`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /story/state returns 403 for non-owner", async () => {
    const chatId = await seedChat();
    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other", "Other", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-user", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(new Request(`http://localhost/api/v1/chats/${chatId}/story/state`,),);
    expect(res.status,).toBe(403,);
  });

  test("POST /story/step returns 403 for non-participant forceActorId", async () => {
    const worldId = await seedWorld();
    const chatId = await seedChat({ worldId, },);
    const strangerActorId = crypto.randomUUID();
    await insertActors(db, "Stranger", { id: strangerActorId, },);
    const res = await makeApp(db,).handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/step`, { forceActorId: strangerActorId, },),
    );

    expect(res.status,).toBe(403,);
  });

  test("POST /story/step returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon-step", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/story/step`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: "{}",
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /gm/escalate returns 403 for non-owner", async () => {
    const chatId = await seedChat();
    const actorId = await seedParticipant(chatId,);
    await insertStoryTurns(db, chatId, 1, actorId, TurnType.CharacterAction, "prompt", {
      status: TurnStatus.Pending,
    },);

    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other2", "Other2", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-escalate", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/gm/escalate`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("POST /story/narration returns 401 for anonymous caller", async () => {
    const worldId = await seedWorld();
    const chatId = await seedChat({ worldId, },);
    const app = new Elysia({ name: "test-anon-narr", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/story/narration`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ text: "hello", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /story/pause returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon-pause", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/pause`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /story/resume returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon-resume", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/resume`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /story/configure returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon-config", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/story/configure`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: "{}",
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /gm/escalate returns 401 for anonymous caller", async () => {
    const chatId = await seedChat();
    const app = new Elysia({ name: "test-anon-escalate", },)
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/gm/escalate`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /story/pause returns 403 for non-owner", async () => {
    const chatId = await seedChat();
    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other3", "Other3", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-pause", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/pause`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("POST /story/resume returns 403 for non-owner", async () => {
    const chatId = await seedChat();
    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other4", "Other4", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-resume", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/resume`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("POST /story/configure returns 403 for non-owner", async () => {
    const chatId = await seedChat();
    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other5", "Other5", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-config", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/story/configure`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: "{}",
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("POST /story/narration returns 403 for non-owner", async () => {
    const worldId = await seedWorld();
    const chatId = await seedChat({ worldId, },);
    const otherUserId = crypto.randomUUID();
    await insertUsers(db, "other6", "Other6", { id: otherUserId, },);
    const app = new Elysia({ name: "test-other-narr", },)
      .derive(() => ({ userId: otherUserId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/story/narration`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ text: "hello", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("co-owner without created_by passes state + pause (owners set)", async () => {
    const chatId = await seedChat();
    const coOwnerId = crypto.randomUUID();
    await insertUsers(db, "co-owner", "CoOwner", { id: coOwnerId, },);
    await insertChatOwners(db, chatId, coOwnerId,);
    const app = new Elysia({ name: "test-co-owner", },)
      .derive(() => ({ userId: coOwnerId, userRole: "user" as const, }))
      .use(storyOrchestrationRoutes({ database: db, config: testConfig, },),);

    const state = await app.handle(new Request(`http://localhost/api/v1/chats/${chatId}/story/state`,),);
    expect(state.status,).toBe(200,);
    const paused = await app.handle(
      request("POST", `http://localhost/api/v1/chats/${chatId}/story/pause`,),
    );

    expect(paused.status,).toBe(200,);
  });
});
