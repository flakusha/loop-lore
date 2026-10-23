// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Service tests for the message-translations variant writer: success,
 * skip (unknown locale / heuristic / translator-unavailable), and the
 * idempotent upsert. Outcomes are returned, never thrown, and a failure
 * never touches the stored original.
 *
 * Resource contract: one fresh in-memory DB per test (createTestDb in
 * beforeEach), destroyed in afterEach; the provider-registry name is unique
 * per run and unregistered in afterEach; no files, no ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { ChatParticipantRole, MessageRole, } from "../db/enums";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateRequest, LLMProvider, } from "../generation/providers/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { translateMessageToLocale, triggerMessageTranslation, } from "./message-translations";
import { CONTENT_LANGUAGE_KEY, } from "./translation-target";

const RUN_ID = crypto.randomUUID().slice(0, 8,);
const PROVIDER = `mt-provider-${RUN_ID}`;
const MODEL = "mt-model";

function makeConfig(): Config {
  const defaults = createConfigSchema().defaults as unknown as {
    generation: Record<string, unknown>;
  };

  defaults.generation.defaultProvider = PROVIDER;
  defaults.generation.defaultModels = { [PROVIDER]: MODEL, };
  return defaults as unknown as Config;
}

function registerStub(): void {
  registerProvider(PROVIDER, {
    capabilities: { label: "MT Test Provider", streaming: false, },
    complete: async (_req: GenerateRequest,) => ({ content: "hola", }),
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider,);
}

describe("message translations service", () => {
  let fixture: TestDb;
  const userId = crypto.randomUUID();
  const chatId = crypto.randomUUID();
  let messageId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    registerStub();
    const db = fixture.db;
    await insertUsers(db, `mt-${userId}`, "MT User", { id: userId, } as never,);
    await insertActors(db, "MT User", { id: userId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "MT Chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, userId, { role_in_chat: ChatParticipantRole.Owner, },);
    messageId = await insertMessages(db, chatId, userId, MessageRole.Assistant, "hello world",);
  },);

  afterEach(async () => {
    unregisterProvider(PROVIDER,);
    await destroyTestDb(fixture,);
  },);

  test("translates and stores a variant row (original untouched)", async () => {
    const outcome = await translateMessageToLocale(fixture.db, makeConfig(), {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "es",
    },);

    expect(outcome.stored,).toBe(true,);
    expect(outcome.locale,).toBe("es",);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.locale,).toBe("es",);
    expect(rows[0]?.content,).toBe("hola",);
    // The original message row keeps its original content.
    const msg = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", messageId,).executeTakeFirst();

    expect(msg?.content,).toBe("hello world",);
  });

  test("retranslation is an idempotent upsert (UNIQUE message_id + locale)", async () => {
    const config = makeConfig();
    const opts = {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "es",
    };

    await translateMessageToLocale(fixture.db, config, opts,);
    await translateMessageToLocale(fixture.db, config, opts,);

    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(1,);
  });

  test("unknown locale is rejected without a row or provider call", async () => {
    const outcome = await translateMessageToLocale(fixture.db, makeConfig(), {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "klingon",
    },);

    expect(outcome,).toMatchObject({ stored: false, translated: false, reason: "unknown-locale", },);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll().execute();
    expect(rows,).toHaveLength(0,);
  });

  test("well-formed non-catalog locales are accepted and stored canonically", async () => {
    // "EN-us" is malformed-CASE but well-FORMED: canonicalized to en-US and
    // stored; the case-variant retarget is the SAME row (upsert idempotency).
    const outcome = await translateMessageToLocale(fixture.db, makeConfig(), {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "EN-us",
    },);

    expect(outcome,).toMatchObject({ stored: true, translated: true, locale: "en-US", },);

    const again = await translateMessageToLocale(fixture.db, makeConfig(), {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "en-US",
    },);

    expect(again,).toMatchObject({ stored: true, locale: "en-US", },);

    const rows = await fixture.db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", messageId,).execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.locale,).toBe("en-US",);
  });

  test("unregistered translator provider skips with a warn (no general-model substitution)", async () => {
    unregisterProvider(PROVIDER,);
    const config = makeConfig();
    registerProvider(`mt-absent-${RUN_ID}`, {
      capabilities: { label: "x", streaming: false, },
      complete: async () => ({ content: "x", }),
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider,);

    unregisterProvider(`mt-absent-${RUN_ID}`,);

    // config names PROVIDER which is now unregistered → resolveProvider fails
    // → empty deps → skip.
    const outcome = await translateMessageToLocale(fixture.db, config, {
      messageId,
      chatId,
      actorId: userId,
      userId,
      plaintext: "hello world",
      locale: "es",
    },);

    expect(outcome,).toMatchObject({ stored: false, reason: "translator-unavailable", },);
    const rows = await fixture.db.selectFrom("message_translations",).selectAll().execute();
    expect(rows,).toHaveLength(0,);
  });

  test("eager trigger writes a row when display differs from native; equal writes none", async () => {
    const db = fixture.db;
    // Display from the CHAT rung (es); native from the model_capabilities
    // override (ja) — rung 1 beats the chat assumption on the native chain.
    await db.updateTable("chats",).set({
      gm_config: JSON.stringify({ [CONTENT_LANGUAGE_KEY]: "es", },),
    },).where("id", "=", chatId,).execute();

    const now = new Date().toISOString();
    const base = {
      context_window: null,
      max_output: null,
      supports_tools: 0,
      supports_vision: 0,
      supports_thinking: 0,
      modalities: null,
      param_size: null,
      owned_by: null,
      user_override: 0,
      notes: null,
      native_locale: "ja",
      last_seen: now,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("model_capabilities",).values({
      ...base,
      id: crypto.randomUUID(),
      provider_id: PROVIDER,
      model_id: MODEL,
    },).execute();

    const outcome = await triggerMessageTranslation(db, makeConfig(), {
      messageId,
      chatId,
      actorId: userId,
      userId,
      content: "hello world",
      provider: PROVIDER,
      model: MODEL,
    },);

    expect(outcome.stored,).toBe(true,);

    // Second message: display == native (the override now says es).
    await db.updateTable("model_capabilities",)
      .set({ native_locale: "es", },)
      .where("provider_id", "=", PROVIDER,)
      .where("model_id", "=", MODEL,)
      .execute();

    const msg2 = await insertMessages(db, chatId, userId, MessageRole.Assistant, "again",);
    const outcome2 = await triggerMessageTranslation(db, makeConfig(), {
      messageId: msg2,
      chatId,
      actorId: userId,
      userId,
      content: "again",
      provider: PROVIDER,
      model: MODEL,
    },);

    expect(outcome2.stored,).toBe(false,);
    expect(outcome2.reason,).toBe("locale-matches-native",);
  });
});
