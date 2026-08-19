// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for handleGetContext max-tokens resolution (FEAT-067).
 *
 * Verifies the context-window budget is resolved per-chat in this order:
 *   1. chats.context_max_tokens (explicit per-chat override)
 *   2. model capability registry (from the most recent message's provider/model)
 *   3. DEFAULT_CONTEXT_WINDOW.maxContextTokens (fallback)
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { upsertModelCapabilities, } from "../../admin/model-capabilities";
import type { DB, } from "../../db/schema";
import { DEFAULT_CONTEXT_WINDOW, } from "../../generation/context-window-config";
import type { ModelInfo, } from "../../generation/providers/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, } from "../../test-utils/insert-helpers";
import { handleGetContext, } from "./handlers";

function makeModel(overrides: Partial<ModelInfo> = {},): ModelInfo {
  return {
    id: "gpt-4o",
    contextWindow: 128_000,
    maxOutput: 16_384,
    toolCalling: true,
    thinking: false,
    modalities: ["text", "image",],
    paramSize: undefined,
    ownedBy: "openai",
    ...overrides,
  };
}

describe("handleGetContext max-tokens resolution", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    userId = crypto.randomUUID();
    actorId = crypto.randomUUID();

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: userId,
        owner_id: userId,
        description: "A test character",
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        content_rating: "general",
        import_spec: "{}",
        template_overrides: "{}",
      },)
      .execute();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  async function createChat(opts?: { id?: string; context_max_tokens?: number | null },): Promise<string> {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Test Chat", userId, {
      id: chatId,
      context_max_tokens: opts?.context_max_tokens ?? null,
    } as never,);
    return chatId;
  }

  async function addMessage(
    chatId: string,
    opts?: { provider?: string | null; model_id?: string | null },
  ): Promise<void> {
    await insertMessages(db, chatId, actorId, "assistant", "Hello world", {
      provider: opts?.provider ?? null,
      model_id: opts?.model_id ?? null,
    },);
  }

  async function getMaxTokens(chatId: string,): Promise<number> {
    const res = await handleGetContext(db, chatId, userId, "solo",);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    return (body as { maxTokens: number }).maxTokens;
  }

  test("falls back to default when no override, model, or registry entry", async () => {
    const chatId = await createChat();
    await addMessage(chatId,);

    const maxTokens = await getMaxTokens(chatId,);
    expect(maxTokens,).toBe(DEFAULT_CONTEXT_WINDOW.maxContextTokens,);
  });

  test("resolves context window from registry via most recent message model", async () => {
    const chatId = await createChat();
    await addMessage(chatId,);
    await addMessage(chatId, { provider: "openai", model_id: "gpt-4o", },);
    await upsertModelCapabilities(db, "openai", [makeModel(),],);

    const maxTokens = await getMaxTokens(chatId,);
    expect(maxTokens,).toBe(128_000,);
  });

  test("falls back to default when message model is not in registry", async () => {
    const chatId = await createChat();
    await addMessage(chatId, { provider: "openai", model_id: "gpt-4o", },);

    const maxTokens = await getMaxTokens(chatId,);
    expect(maxTokens,).toBe(DEFAULT_CONTEXT_WINDOW.maxContextTokens,);
  });

  test("per-chat context_max_tokens overrides registry value", async () => {
    const chatId = await createChat({ context_max_tokens: 64_000, },);
    await addMessage(chatId, { provider: "openai", model_id: "gpt-4o", },);
    await upsertModelCapabilities(db, "openai", [makeModel(),],);

    const maxTokens = await getMaxTokens(chatId,);
    expect(maxTokens,).toBe(64_000,);
  });

  test("registry lookup uses most recent (not first) message model", async () => {
    const chatId = await createChat();
    // Older message with a different model
    await addMessage(chatId, { provider: "openai", model_id: "gpt-3.5", },);
    // Most recent message with the model we registered
    await addMessage(chatId, { provider: "openai", model_id: "gpt-4o", },);

    await upsertModelCapabilities(db, "openai", [makeModel(),],);

    const maxTokens = await getMaxTokens(chatId,);
    expect(maxTokens,).toBe(128_000,);
  });
});
