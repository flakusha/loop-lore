// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `storeStoryResponse`
 * (src/generation/auto-gen/story-store.ts).
 *
 * Calls the persistence path directly (encryption deps stubbed, real
 * content-hook chain against an in-memory DB) — the GM boundary is not
 * involved, so no mock.module/isolate gating is needed.
 *
 * Covered: happy path (assistant row persisted with encrypted content),
 * swipe index computation with/without parent, ensureActorKey invoked when
 * an SMK exists, and content-hook denial → null + no row (fail closed).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { ContentRating, MessageRole, MessageStatus, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { GenDeps, } from "./deps";
import { storeStoryResponse, } from "./story-store";
let db: Kysely<DB>;
let sqlite: Database;
/** Captured ensureActorKey calls (actorId per call). */
let ensuredActorKeys: string[] = [];
const logger = createLogger({ level: "error", },);

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  setTestDatabase(db,);
  await db.insertInto("users",).values({
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
  sqlite.close();
},);
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

/** @param opts */
function makeDeps(opts?: { smk?: string | null },): Pick<
  GenDeps,
  "getSmk" | "ensureActorKey" | "getChatEncryptionLevel" | "encryptAtRest"
> {
  return {
    getSmk: (() => opts?.smk ?? null) as unknown as GenDeps["getSmk"],
    ensureActorKey: (async ({ actorId, }: { actorId: string },) => {
      ensuredActorKeys.push(actorId,);
    }) as unknown as GenDeps["ensureActorKey"],
    getChatEncryptionLevel: (async () => "none") as unknown as GenDeps["getChatEncryptionLevel"],
    encryptAtRest: (async ({ plaintext, }: { plaintext: string },) => ({
      storedContent: `enc:${plaintext}`,
      keyId: null,
    })) as unknown as GenDeps["encryptAtRest"],
  };
}

/** Seed world + chat + participant actor; returns ids. */
async function seedScenario(opts?: { actor?: Record<string, unknown> },): Promise<{
  chatId: string;
  actorId: string;
  worldId: string;
}> {
  const worldId = randomUUID();
  await db.insertInto("worlds",).values({
    id: worldId,
    owner_id: "user-1",
    name: "World",
    scan_depth: 0,
    token_budget: 4096,
    difficulty_modifier: 1,
    difficulty_reroll: "none",
    difficulty_state: "normal",
  },).execute();
  const chatId = randomUUID();
  await db.insertInto("chats",).values({
    id: chatId,
    name: "Chat",
    type: "direct",
    mode: "story",
    created_by: "user-1",
    world_id: worldId,
  },).execute();
  const actorId = await seedActor(db, opts?.actor,);
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
  return { chatId, actorId, worldId, };
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param parentId
 * @param swipeIndex
 */
async function seedMessage(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  parentId: string | null,
  swipeIndex: number,
): Promise<string> {
  const id = randomUUID();
  await db.insertInto("messages",).values({
    id,
    chat_id: chatId,
    actor_id: actorId,
    parent_id: parentId,
    role: MessageRole.Assistant,
    content: "prior variant",
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

test("persists the assistant row with encrypted content and confirmed status", async () => {
  const { chatId, actorId, } = await seedScenario();

  const result = await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId,
    userId: "user-1",
    parentMessageId: null,
    actorId,
    response: "The wind howls over the pass.",
    usedModel: "model-x",
    usedProviderName: "provider-y",
    deps: makeDeps(),
    log: logger,
  },);

  expect(result?.messageId,).toBeTruthy();
  const row = await db
    .selectFrom("messages",).selectAll()
    .where("id", "=", result!.messageId,).executeTakeFirstOrThrow();
  expect(row.role,).toBe(MessageRole.Assistant,);
  expect(row.content,).toBe("enc:The wind howls over the pass.",);
  expect(row.status,).toBe(MessageStatus.Confirmed,);
  expect(row.visibility,).toBe("visible",);
  expect(row.swipe_index,).toBeNull();
  expect(row.parent_id,).toBeNull();
});

test("computes swipe_index = max existing sibling swipe + 1 when parent set", async () => {
  const { chatId, actorId, } = await seedScenario();
  const parentId = await seedMessage(db, chatId, actorId, null, 0,);
  await seedMessage(db, chatId, actorId, parentId, 1,);
  await seedMessage(db, chatId, actorId, parentId, 4,);

  const result = await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId,
    userId: "user-1",
    parentMessageId: parentId,
    actorId,
    response: "new variant",
    usedModel: "m",
    usedProviderName: "p",
    deps: makeDeps(),
    log: logger,
  },);

  const row = await db
    .selectFrom("messages",).selectAll()
    .where("id", "=", result!.messageId,).executeTakeFirstOrThrow();
  expect(row.parent_id,).toBe(parentId,);
  expect(row.swipe_index,).toBe(5,);
});

test("first variant under a parent gets swipe_index 1", async () => {
  const { chatId, actorId, } = await seedScenario();
  const parentId = await seedMessage(db, chatId, actorId, null, 0,);

  const result = await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId,
    userId: "user-1",
    parentMessageId: parentId,
    actorId,
    response: "first variant",
    usedModel: "m",
    usedProviderName: "p",
    deps: makeDeps(),
    log: logger,
  },);

  const row = await db
    .selectFrom("messages",).select("swipe_index",)
    .where("id", "=", result!.messageId,).executeTakeFirstOrThrow();
  expect(row.swipe_index,).toBe(1,);
});

test("ensureActorKey runs only when an SMK exists", async () => {
  ensuredActorKeys = [];
  const withSmk = await seedScenario();
  await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId: withSmk.chatId,
    userId: "user-1",
    parentMessageId: null,
    actorId: withSmk.actorId,
    response: "smk run",
    usedModel: "m",
    usedProviderName: "p",
    deps: makeDeps({ smk: "smk-bytes", },),
    log: logger,
  },);
  expect(ensuredActorKeys,).toEqual([withSmk.actorId,],);

  ensuredActorKeys = [];
  const withoutSmk = await seedScenario();
  await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId: withoutSmk.chatId,
    userId: "user-1",
    parentMessageId: null,
    actorId: withoutSmk.actorId,
    response: "no smk run",
    usedModel: "m",
    usedProviderName: "p",
    deps: makeDeps({ smk: null, },),
    log: logger,
  },);
  expect(ensuredActorKeys,).toEqual([],);
});

test("content-hook denial returns null and persists nothing (fail closed)", async () => {
  // NSFW-rated actor + gateless user → NSFW gate blocks the hook chain.
  await db.insertInto("users",).values({
    id: "user-gateless",
    username: "gateless",
    display_name: "Gateless",
    role: "user",
    status: "active",
    settings: "{}",
    birth_date: "1990-01-01",
    age_gate_accepted_at: null,
  },).execute();
  const { chatId, actorId, } = await seedScenario({
    actor: { content_rating: ContentRating.NsfwMild, },
  },);

  const result = await storeStoryResponse({
    database: db,
    config: makeConfig(),
    chatId,
    userId: "user-gateless",
    parentMessageId: null,
    actorId,
    response: "spicy text",
    usedModel: "m",
    usedProviderName: "p",
    deps: makeDeps(),
    log: logger,
  },);

  expect(result,).toBeNull();
  const rows = await db
    .selectFrom("messages",).selectAll()
    .where("chat_id", "=", chatId,).execute();
  expect(rows,).toHaveLength(0,);
});
