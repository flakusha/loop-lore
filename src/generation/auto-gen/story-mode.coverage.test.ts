// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `triggerStoryModeGeneration` (src/generation/auto-gen/story-mode.ts).
 *
 * The pre-existing story-mode.test.ts ships a single skipped test, so the
 * module sat at 0%. This file drives the real pipeline end-to-end with an
 * in-memory SQLite DB (createTestDb, mirroring src/story/game-master.test.ts
 * seeding) and stubbed GenDeps provider/encryption edges:
 *
 *   - full LLM turn → hooks → encrypt → message insert → acceptResponse
 *   - missing gm_config → synthesized default config (warn branch)
 *   - parentMessageId → swipe_index computation
 *   - content-hook denial → early return, no message persisted
 *
 * GameMasterService, runContentHooks, and detectHallucinations run REAL —
 * only the provider completion and encryption deps are stubbed.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { ContentRating, MessageRole, MessageStatus, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import type { GenDeps, } from "./deps";
import { triggerStoryModeGeneration, } from "./story-mode";

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
 * @param overrides
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

interface DepsHooks {
  resolveCalls: string[];
  completeCalls: string[];
  ensureKeyCalls: string[];
  smk?: Record<string, string>;
}

/** */
function makeDeps(hooks: DepsHooks,): GenDeps {
  return {
    resolveProvider: (async () => {
      hooks.resolveCalls.push("default",);
      return {
        resolvedProviderName: "stub-provider",
        resolvedModel: "stub-model",
        resolvedApiKey: null,
        provider: {
          complete: async () => {
            hooks.completeCalls.push("turn",);
            return {
              content: "I am ready. *He steps forward confidently.* The shadows cannot stop us. " +
                "The moonlight reveals the path ahead, and the ancient whispers guide our way. " +
                "This unexpected quest requires courage!",
            };
          },
        },
      };
    }) as unknown as GenDeps["resolveProvider"],
    getSmk: (() => hooks.smk ?? null) as unknown as GenDeps["getSmk"],
    ensureActorKey: (async (args: { actorId: string },) => {
      hooks.ensureKeyCalls.push(args.actorId,);
    }) as unknown as GenDeps["ensureActorKey"],
    getChatEncryptionLevel: (async () => "none") as unknown as GenDeps["getChatEncryptionLevel"],
    encryptAtRest: (async () => ({ storedContent: "stored-content", keyId: null, })) as unknown as GenDeps["encryptAtRest"],
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

// ── Tests ──────────────────────────────────────────────────────

describe("triggerStoryModeGeneration", () => {
  test("runs a full LLM turn and persists the encrypted assistant message", async () => {
    const worldId = await seedWorld(testDb,);
    const locationId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, worldId, locationId,);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);

    const hooks: DepsHooks = { resolveCalls: [], completeCalls: [], ensureKeyCalls: [], smk: { secret: "smk", }, };
    await triggerStoryModeGeneration({
      database: testDb,
      config: makeConfig(),
      chatId,
      parentMessageId: null,
      userId: "user-1",
      gmConfig: makeGmConfigJson(),
      worldId,
      deps: makeDeps(hooks,),
    },);

    expect(hooks.completeCalls.length,).toBeGreaterThanOrEqual(1,);
    expect(hooks.resolveCalls.length,).toBeGreaterThanOrEqual(1,);
    expect(hooks.ensureKeyCalls,).toEqual([actorId,],);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    const assistant = messages.find((m,) => m.role === MessageRole.Assistant,);
    expect(assistant,).toBeDefined();
    expect(assistant?.content,).toBe("stored-content",);
    expect(assistant?.provider,).toBe("stub-provider",);
    expect(assistant?.model_id,).toBe("stub-model",);
    expect(assistant?.status,).toBe(MessageStatus.Confirmed,);
    expect(assistant?.swipe_index,).toBeNull();
    expect(assistant?.key_id,).toBeNull();

    // acceptResponse ran the quality pipeline and updated the turn.
    const turns = await testDb.selectFrom("story_turns",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    expect(turns,).toHaveLength(1,);
    expect(turns[0]?.response_received,).toContain("ancient whispers",);
  });

  test("synthesizes a default config and still generates when gm_config is missing", async () => {
    const worldId = await seedWorld(testDb,);
    const locationId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, worldId, locationId,);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);

    const hooks: DepsHooks = { resolveCalls: [], completeCalls: [], ensureKeyCalls: [], };
    await triggerStoryModeGeneration({
      database: testDb,
      config: makeConfig(),
      chatId,
      parentMessageId: null,
      userId: "user-1",
      gmConfig: null,
      worldId,
      deps: makeDeps(hooks,),
    },);

    expect(hooks.completeCalls.length,).toBeGreaterThanOrEqual(1,);
    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    expect(messages.some((m,) => m.role === MessageRole.Assistant,),).toBe(true,);
  });

  test("computes the next swipe index when parentMessageId is set", async () => {
    const worldId = await seedWorld(testDb,);
    const locationId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, worldId, locationId,);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);
    const parentId = await seedParentMessage(testDb, chatId, actorId, 0,);

    const hooks: DepsHooks = { resolveCalls: [], completeCalls: [], ensureKeyCalls: [], };
    await triggerStoryModeGeneration({
      database: testDb,
      config: makeConfig(),
      chatId,
      parentMessageId: parentId,
      userId: "user-1",
      gmConfig: makeGmConfigJson(),
      worldId,
      deps: makeDeps(hooks,),
    },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    const assistant = messages.find((m,) => m.role === MessageRole.Assistant,);
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
    const worldId = await seedWorld(testDb,);
    const locationId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, worldId, locationId, { created_by: gatelessUser, },);
    const actorId = await seedActor(testDb, { content_rating: ContentRating.NsfwMild, },);
    await seedParticipant(testDb, chatId, actorId,);

    const hooks: DepsHooks = { resolveCalls: [], completeCalls: [], ensureKeyCalls: [], };
    await triggerStoryModeGeneration({
      database: testDb,
      config: makeConfig(),
      chatId,
      parentMessageId: null,
      userId: gatelessUser,
      gmConfig: makeGmConfigJson(),
      worldId,
      deps: makeDeps(hooks,),
    },);

    const messages = await testDb.selectFrom("messages",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    expect(messages,).toHaveLength(0,);

    // The turn itself ran — only the pre-store hook gate blocked persistence.
    const turns = await testDb.selectFrom("story_turns",).selectAll().where(
      "chat_id", "=", chatId,
    ).execute();
    expect(turns,).toHaveLength(1,);
  });
});
