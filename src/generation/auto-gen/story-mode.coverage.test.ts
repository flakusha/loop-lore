// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `triggerStoryModeGeneration` (src/generation/auto-gen/story-mode.ts).
 *
 * Mirrors the isolation approach of the sibling story-mode.test.ts: the
 * GameMasterService boundary is mocked (gated to --isolate runs, where
 * mock.module cannot leak) so the turn-result shape is deterministic, while
 * the REAL persistence path runs end-to-end against an in-memory SQLite DB
 * (createTestDb) with stubbed encryption deps:
 *
 *   - GM response → hallucination check → hooks → encrypt → message insert
 *     → acceptResponse
 *   - Human-GM (null response) → no message stored
 *   - missing gm_config → synthesized default config, still stores
 *   - parentMessageId → parent_id + swipe_index computation
 *   - content-hook denial → fail closed, no message persisted
 *
 * The `await import("./story-mode")` below is deliberate: bun's mock.module
 * must be registered before the module-under-test is first evaluated (same
 * pattern as story-mode.test.ts).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { ContentRating, MessageRole, MessageStatus, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { GenDeps, } from "./deps";

// ── GM boundary mock (isolate-gated; see story-mode.test.ts) ───

/** Response text the mocked GM turn returns; null = Human-GM turn. */
let mockTurnResponse: string | null = "The hero advances. The ancient whispers guide our way.";
/** Actor id reported by the mocked turn; reassigned per test. */
let mockActorId = "actor-gm";
/** acceptResponse capture. */
let capturedAcceptResponse: { turnId: string; response: string } | null = null;

// The suite replaces the GameMasterService boundary via mock.module, which is
// only safe under --isolate (the canonical gate); plain runs skip it.
if (ISOLATED) {
  mock.module("../../story", () => ({
    GameMasterService: class {
      async initialize(): Promise<void> {
        /* noop */
      }

      async executeTurn(): Promise<{
        turnId: string;
        turnNumber: number;
        actorId: string;
        prompt: string;
        response: string | null;
      }> {
        return {
          turnId: "turn-1",
          turnNumber: 1,
          actorId: mockActorId,
          prompt: "GM hidden prompt.",
          response: mockTurnResponse,
        };
      }

      async acceptResponse(turnId: string, response: string,): Promise<void> {
        capturedAcceptResponse = { turnId, response, };
      }
    },
  }),);
}

const { triggerStoryModeGeneration, } = await import("./story-mode");

// ── Test DB ──────────────────────────────────────────────────

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

beforeEach(async () => {
  createLogger({ level: "error", },);
  setTestDatabase(testDb,);
  resetTestDb(testSqlite,);
  mockTurnResponse = "The hero advances. The ancient whispers guide our way.";
  capturedAcceptResponse = null;
  await testDb.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2025-01-01T00:00:00Z",
  },).execute();
},);

afterAll(() => {
  setTestDatabase(null,);
  testSqlite.close();
},);

// ── Seed helpers (mirroring src/story/game-master.test.ts) ────

/**
 * @param db
 * @param opts
 */
async function seedUser(
  db: Kysely<DB>,
  opts: { birthDate?: string | null; ageGateAcceptedAt?: string | null } = {},
): Promise<string> {
  const id = randomUUID();
  await db.insertInto("users",).values({
    id,
    username: `user-${id.slice(0, 8,)}`,
    display_name: "User",
    role: "user",
    status: "active",
    settings: "{}",
    birth_date: opts.birthDate ?? null,
    age_gate_accepted_at: opts.ageGateAcceptedAt ?? null,
  },).execute();
  return id;
}

/**
 * @param db
 */
async function seedWorld(db: Kysely<DB>,): Promise<string> {
  const id = randomUUID();
  await db.insertInto("worlds",).values({
    id,
    owner_id: "user-1",
    name: "Test World",
    scan_depth: 0,
    token_budget: 4096,
    difficulty_modifier: 1,
    difficulty_reroll: "none",
    difficulty_state: "normal",
  },).execute();
  return id;
}

/**
 * @param db
 * @param worldId
 */
async function seedLocation(db: Kysely<DB>, worldId: string,): Promise<string> {
  const id = randomUUID();
  await db.insertInto("locations",).values({
    id,
    world_id: worldId,
    name: "Tavern",
    connections: "[]",
  },).execute();
  await db.insertInto("location_states",).values({
    location_id: id,
    world_id: worldId,
    atmosphere: "cozy",
    npcs_present: "[]",
    items_available: "[]",
    hazards: "[]",
  },).execute();
  return id;
}

/**
 * @param db
 * @param overrides
 */
async function seedActor(
  db: Kysely<DB>,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await db.insertInto("actors",).values({
    id,
    actor_type: "character",
    display_name: "Hero",
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
    content_rating: ContentRating.Sfw,
    ...overrides,
  },).execute();
  return id;
}

/**
 * @param db
 * @param chatId
 * @param actorId
 */
async function seedParticipant(db: Kysely<DB>, chatId: string, actorId: string,): Promise<void> {
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
}

/**
 * @param db
 * @param worldId
 * @param locationId
 * @param overrides
 */
async function seedChat(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await db.insertInto("chats",).values({
    id,
    name: "Story Chat",
    type: "direct",
    mode: "story",
    created_by: "user-1",
    world_id: worldId,
    current_location_id: locationId,
    ...overrides,
  },).execute();
  return id;
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param swipeIndex
 */
async function seedParentMessage(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  swipeIndex = 0,
): Promise<string> {
  const id = randomUUID();
  await db.insertInto("messages",).values({
    id,
    chat_id: chatId,
    actor_id: actorId,
    parent_id: null,
    role: MessageRole.User,
    content: "parent prompt",
    key_id: null,
    content_type: "text",
    content_format: "markdown",
    content_encoding: "identity",
    model_id: null,
    provider: null,
    status: MessageStatus.Confirmed,
    visibility: "visible",
    swipe_index: swipeIndex,
    emotion: null,
  },).execute();
  return id;
}

// ── Config + deps factories ──────────────────────────────────

/** */
function makeConfig(): Config {
  return {
    nsfw: {
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: false,
      useLlmClassifier: false,
    },
    templates: { llm: { systemPrompts: {}, }, },
    encryption: { compressThreshold: 100_000, compressAlgorithm: "none", },
  } as unknown as Config;
}

/** */
function makeDeps(): GenDeps {
  return {
    resolveProvider: (async () => ({
      resolvedProviderName: "stub-provider",
      resolvedModel: "stub-model",
      resolvedApiKey: null,
      provider: {
        complete: async () => ({ content: "unused — GM boundary is mocked", }),
      },
    })) as unknown as GenDeps["resolveProvider"],
    getSmk: (() => null) as unknown as GenDeps["getSmk"],
    ensureActorKey: (async () => {
      /* noop */
    }) as unknown as GenDeps["ensureActorKey"],
    getChatEncryptionLevel: (async () => "none") as unknown as GenDeps["getChatEncryptionLevel"],
    encryptAtRest:
      (async () => ({ storedContent: "stored-content", keyId: null, })) as unknown as GenDeps["encryptAtRest"],
  } as unknown as GenDeps;
}

/** */
function makeGmConfigJson(): string {
  return JSON.stringify({
    type: "llm",
    llmConfig: {
      model: "gm-model",
      provider: "gm-provider",
      systemPrompt: "You are the Game Master.",
      temperature: 0.7,
      maxTokens: 800,
    },
    escalationThreshold: 40,
  },);
}

/** Seed the full world/location/chat/actor graph and return the ids. */
async function seedScenario(
  overrides?: { chat?: Record<string, unknown>; actor?: Record<string, unknown> },
): Promise<{ chatId: string; actorId: string; worldId: string; locationId: string }> {
  const worldId = await seedWorld(testDb,);
  const locationId = await seedLocation(testDb, worldId,);
  const chatId = await seedChat(testDb, worldId, locationId, overrides?.chat,);
  const actorId = await seedActor(testDb, overrides?.actor,);
  await seedParticipant(testDb, chatId, actorId,);
  return { chatId, actorId, worldId, locationId, };
}

/** Run one generation turn against a freshly seeded scenario. */
async function runTurn(opts: {
  chatId: string;
  worldId: string;
  userId?: string;
  parentMessageId?: string | null;
  gmConfig?: string | null;
},): Promise<void> {
  await triggerStoryModeGeneration({
    database: testDb,
    config: makeConfig(),
    chatId: opts.chatId,
    parentMessageId: opts.parentMessageId ?? null,
    userId: opts.userId ?? "user-1",
    gmConfig: opts.gmConfig === undefined ? makeGmConfigJson() : opts.gmConfig,
    worldId: opts.worldId,
    deps: makeDeps(),
  },);
}

// ── Tests ──────────────────────────────────────────────────────

describeOrSkip("triggerStoryModeGeneration", () => {
  test("stores the GM response through encrypt + hooks and calls acceptResponse", async () => {
    const { chatId, actorId, worldId, } = await seedScenario();
    mockActorId = actorId;

    await runTurn({ chatId, worldId, },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id",
      "=",
      chatId,
    ).execute();
    const assistant = messages.find((m,) => m.role === MessageRole.Assistant);
    expect(assistant,).toBeDefined();
    expect(assistant?.content,).toBe("stored-content",);
    expect(assistant?.key_id,).toBeNull();
    expect(assistant?.status,).toBe(MessageStatus.Confirmed,);

    // acceptResponse received the raw GM response, not the encrypted blob.
    expect(capturedAcceptResponse,).not.toBeNull();
    expect(capturedAcceptResponse?.turnId,).toBe("turn-1",);
    expect(capturedAcceptResponse?.response,).toContain("ancient whispers",);
  });

  test("Human-GM turn (null response) stores no message and skips acceptResponse", async () => {
    const { chatId, worldId, } = await seedScenario();
    mockTurnResponse = null;

    await runTurn({ chatId, worldId, },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id",
      "=",
      chatId,
    ).execute();
    expect(messages,).toHaveLength(0,);
    expect(capturedAcceptResponse,).toBeNull();
  });

  test("synthesizes a default config and still stores when gm_config is missing", async () => {
    const { chatId, actorId, worldId, } = await seedScenario();
    mockActorId = actorId;

    await runTurn({ chatId, worldId, gmConfig: null, },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id",
      "=",
      chatId,
    ).execute();
    expect(messages.some((m,) => m.role === MessageRole.Assistant),).toBe(true,);
    expect(capturedAcceptResponse,).not.toBeNull();
  });

  test("computes the next swipe index and parent link when parentMessageId is set", async () => {
    const { chatId, actorId, worldId, } = await seedScenario();
    mockActorId = actorId;
    const parentId = await seedParentMessage(testDb, chatId, actorId, 0,);

    await runTurn({ chatId, worldId, parentMessageId: parentId, },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id",
      "=",
      chatId,
    ).execute();
    const assistant = messages.find((m,) => m.role === MessageRole.Assistant);
    expect(assistant,).toBeDefined();
    expect(assistant?.parent_id,).toBe(parentId,);
    expect(assistant?.swipe_index,).toBe(1,);
  });

  test("does not persist a message when content hooks deny the turn", async () => {
    // NSFW-rated actor + user without an age-gate accept → the NSFW gate
    // blocks the hook chain → story-mode must fail closed (no message).
    const gatelessUser = await seedUser(testDb, {
      birthDate: "1990-01-01",
      ageGateAcceptedAt: null,
    },);
    const { chatId, actorId, worldId, } = await seedScenario({
      chat: { created_by: gatelessUser, },
      actor: { content_rating: ContentRating.NsfwMild, },
    },);
    mockActorId = actorId;

    await runTurn({ chatId, worldId, userId: gatelessUser, },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id",
      "=",
      chatId,
    ).execute();
    expect(messages,).toHaveLength(0,);
    expect(capturedAcceptResponse,).toBeNull();
  });
},);
