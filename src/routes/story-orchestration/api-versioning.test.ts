// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-orchestration API-versioning regression test.
 *
 * `index.test.ts` mounts the plugin at its DEFAULT prefix only, so it never
 * proved the routes are reachable at the versioned `/api/v1` path that the
 * browser actually calls (`src/frontend/alpine/story-controls.ts`) — and that
 * `elysia-app.ts` will NOT 308-redirect, because the redirect skips paths that
 * already start with `/api/v1`.
 *
 * This file composes the app through the REAL `registerPlugins` entry point and
 * asserts both prefixes resolve. Reverting the versioned
 * `storyOrchestrationRoutes` mount in `src/app/register-plugins.ts` fails every
 * versioned assertion here.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { registerPlugins, } from "../../app/register-plugins";
import type { AsyncStore, } from "../../async/store";
import { loadConfig, } from "../../config/load";
import { TurnStatus, TurnType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertStoryTurns,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { MockLLMProvider, } from "../../test-utils/mock-provider";

const PROVIDER = "story-orch-versioning-mock";
const USER_ID = "story-version-user";

/** Chat gm_config: LLM game master backed by the registered mock provider. */
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

/** Test seam — matches the AsyncStore surface consumed by route plugins. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },

    destroy() {},
  };
}

/**
 * Builds the app through the REAL production entry point (`registerPlugins`),
 * not a hand-rolled mirror of it. A mirror would keep passing even after the
 * production mount was reverted — exactly the regression this file catches.
 * @param db - test database
 * @returns the composed app
 */
function makeRealisticApp(db: Kysely<DB>,): Elysia {
  const config = loadConfig();
  config.cron.enabled = false;
  const app = new Elysia({ name: "test-story-orch-versioning", },);
  registerPlugins(app as unknown as Elysia<any>, {
    database: db as never,
    config,
    asyncStore: stubAsyncStore(),
  },);

  return app;
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

describe("story-orchestration api versioning", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    registerProvider(PROVIDER, new MockLLMProvider(),);
    await insertUsers(db, "story-version", "Story Version", { id: USER_ID, },);
  },);

  afterAll(() => {
    unregisterProvider(PROVIDER,);
    sqlite.close();
  },);

  /** @returns a seeded story-mode chat id */
  async function seedChat(): Promise<string> {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Version Chat", USER_ID, {
      id: chatId,
      mode: "story",
      world_id: null,
      gm_config: GM_CONFIG,
      story_state: STORY_STATE,
    },);

    return chatId;
  }

  /**
   * @param chatId
   * @returns a pending story turn id, so gm/escalate has something to escalate
   */
  async function seedOpenTurn(chatId: string,): Promise<string> {
    const actorId = crypto.randomUUID();
    const turnId = crypto.randomUUID();
    await insertActors(db, "Goblin", { id: actorId, },);
    await insertChatParticipants(db, chatId, actorId,);
    await insertStoryTurns(db, chatId, 1, actorId, TurnType.CharacterAction, "prompt", {
      id: turnId,
      status: TurnStatus.Pending,
    },);

    return turnId;
  }

  for (const prefix of ["/api", "/api/v1",]) {
    test(`POST ${prefix}/chats/:id/story/pause resolves`, async () => {
      const chatId = await seedChat();
      const res = await makeRealisticApp(db,).handle(
        request("POST", `http://localhost${prefix}/chats/${chatId}/story/pause`,),
      );

      expect(res.status,).toBe(200,);
      expect(await res.json() as { ok: boolean; isPaused: boolean },).toMatchObject({
        ok: true,
        isPaused: true,
      },);
    });

    test(`GET ${prefix}/chats/:id/story/state resolves`, async () => {
      const chatId = await seedChat();
      const res = await makeRealisticApp(db,).handle(
        new Request(`http://localhost${prefix}/chats/${chatId}/story/state`,),
      );

      expect(res.status,).toBe(200,);
      expect(await res.json(),).toMatchObject({ chatId, currentTurn: 0, isPaused: false, },);
    });

    test(`POST ${prefix}/chats/:id/gm/escalate resolves`, async () => {
      const chatId = await seedChat();
      const turnId = await seedOpenTurn(chatId,);
      const res = await makeRealisticApp(db,).handle(
        request("POST", `http://localhost${prefix}/chats/${chatId}/gm/escalate`,),
      );

      expect(res.status,).toBe(200,);
      expect(await res.json(),).toMatchObject({ ok: true, turnId, status: TurnStatus.Escalated, },);
    });
  }

  test("/api/v1 is not a catch-all — an unmounted path is not served", async () => {
    const res = await makeRealisticApp(db,).handle(
      new Request("http://localhost/api/v1/definitely-not-a-route",),
    );

    expect(res.status,).toBe(404,);
  });
});
