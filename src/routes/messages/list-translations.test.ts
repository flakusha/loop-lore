// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the list-endpoint translation negotiation helpers:
 * `attachRequestedTranslations`, `attachMessageTranslations` and
 * `resolveAutoDisplayLocale`.
 *
 * Resource contract (parallel-safe):
 * - Each test owns a FRESH in-memory SQLite DB (`createTestDb` in
 *   beforeEach) — `:memory:` handles are per-instance, never a shared
 *   file, so concurrent runners cannot collide.
 * - Teardown is deterministic: `destroyTestDb` runs in `afterEach`, which
 *   Bun executes even when an assertion throws, so a failed test cannot
 *   leak an open handle into the next one.
 * - No ordering dependence: every test seeds its own chat/user/message
 *   rows in `beforeEach`; none reads state left by another.
 * - No process globals are set: this file never calls
 *   `setTestDatabase`, never registers a provider, opens a port or
 *   writes a file. The SUT takes the Kysely handle as a parameter, so
 *   nothing resolves the global database.
 * - The `owner` id is a per-process UUID; usernames are unique per DB.
 *
 * The `brokenDb()` stub is a pure in-memory object — it never touches a
 * real database.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  createTestDb,
  destroyTestDb,
  type TestDb,
} from "../../test-utils/create-test-db";
import {
  insertChats,
  insertMessages,
  insertMessageTranslations,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  attachMessageTranslations,
  attachRequestedTranslations,
  resolveAutoDisplayLocale,
} from "./list-translations";

/** A DB stub whose queries always fail — proves the failure is contained. */
function brokenDb(): Kysely<DB> {
  return {
    selectFrom: () => {
      throw new Error("db is down",);
    },
  } as unknown as Kysely<DB>;
}

/** */
describe("list-translations helpers", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;
  const owner = uid();
  let chatId: string;
  let enMessageId: string;
  let esMessageId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    db = fixture.db;

    await insertUsers(db, `user-${owner}`, "Owner", { id: owner, } as never,);
    await db.insertInto("actors",).values({
      id: owner,
      actor_type: "user",
      display_name: "Owner",
      user_id: owner,
      owner_id: owner,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    chatId = uid();
    await insertChats(db, "List Chat", owner, {
      id: chatId,
      gm_config: JSON.stringify({ contentLanguage: "en", },),
    } as never,);

    enMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "hello", {
      id: enMessageId,
    } as never,);

    esMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "hola", {
      id: esMessageId,
    } as never,);

    await insertMessageTranslations(db, enMessageId, "en-US", "hello (en)", new Date().toISOString(),);
    await insertMessageTranslations(db, esMessageId, "es", "hola (es)", new Date().toISOString(),);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  /** */
  test("no requested locale leaves the messages untouched", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, { chatId, userId: owner, },);
    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("an empty requested locale is treated as absent", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, {
      chatId,
      userId: owner,
      requestedLocale: "",
    },);

    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("an explicit locale attaches the matching row only", async () => {
    const messages: Record<string, unknown>[] = [
      { id: enMessageId, chat_id: chatId, },
      { id: esMessageId, chat_id: chatId, },
    ];

    await attachRequestedTranslations(db, messages, {
      chatId,
      userId: owner,
      requestedLocale: "en-us",
    },);

    expect(messages[0]!["translation"],).toEqual({ locale: "en-US", content: "hello (en)", },);
    expect(messages[1]!["translation"],).toBeUndefined();
  });

  /** */
  test("auto resolves the display locale and attaches its row", async () => {
    // The chat content language is "en": store a matching row and prove the
    // auto path resolves to it (the "en-US" row must NOT match).
    await insertMessageTranslations(db, esMessageId, "en", "hola (en)", new Date().toISOString(),);

    const messages: Record<string, unknown>[] = [{ id: esMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, {
      chatId,
      userId: owner,
      requestedLocale: "auto",
    },);

    expect(messages[0]!["translation"],).toEqual({ locale: "en", content: "hola (en)", },);
  });

  /** */
  test("auto attaches nothing when the resolved locale has no row", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, {
      chatId,
      userId: owner,
      requestedLocale: "auto",
    },);

    // Resolved locale is "en"; the stored row is "en-US" — no match.
    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("auto attaches nothing when no display locale resolves", async () => {
    const plainChatId = uid();
    await insertChats(db, "Plain Chat", owner, { id: plainChatId, } as never,);
    const plainUserId = uid();
    await insertUsers(db, `user-${plainUserId}`, "Reader", { id: plainUserId, } as never,);

    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, {
      chatId: plainChatId,
      userId: plainUserId,
      requestedLocale: "auto",
    },);

    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("a malformed locale attaches nothing", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(db, messages, {
      chatId,
      userId: owner,
      requestedLocale: "klingon!",
    },);

    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("a lookup failure never propagates to the caller", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(brokenDb(), messages, {
      chatId,
      userId: owner,
      requestedLocale: "en",
    },);

    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("auto with a failing lookup never propagates to the caller", async () => {
    const messages: Record<string, unknown>[] = [{ id: enMessageId, chat_id: chatId, },];
    await attachRequestedTranslations(brokenDb(), messages, {
      chatId,
      userId: owner,
      requestedLocale: "auto",
    },);

    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("attachMessageTranslations ignores an empty message list", async () => {
    const messages: Record<string, unknown>[] = [];
    await attachMessageTranslations(db, messages, "en-US",);
    expect(messages,).toEqual([],);
  });

  /** */
  test("attachMessageTranslations ignores rows without a string id", async () => {
    const messages: Record<string, unknown>[] = [{ id: 42, chat_id: chatId, },];
    await attachMessageTranslations(db, messages, "en-US",);
    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("attachMessageTranslations leaves messages without a row untouched", async () => {
    const messages: Record<string, unknown>[] = [{ id: esMessageId, chat_id: chatId, },];
    await attachMessageTranslations(db, messages, "en-US",);
    expect(messages[0]!["translation"],).toBeUndefined();
  });

  /** */
  test("attachMessageTranslations degrades to the placeholder on a decrypt failure", async () => {
    // A chat at the `standard` tier plus an encrypted-payload envelope:
    // decryption fails (no SMK in tests) and the row degrades.
    const encChatId = uid();
    await insertChats(db, "Encrypted Chat", owner, {
      id: encChatId,
      encryption_level: "standard",
    } as never,);

    const encMessageId = uid();
    await insertMessages(db, encChatId, owner, MessageRole.User, "secret", {
      id: encMessageId,
    } as never,);

    await insertMessageTranslations(db, encMessageId, "fr", "bonjour", new Date().toISOString(), {
      key_id: "missing-key",
      content_encoding: "identity",
    },);

    await db.updateTable("message_translations",).set({
      content: JSON.stringify({
        enc: "AAAA",
        nonce: "AAAAAAAAAAAAAAAA",
        algo: "aes-256-gcm",
        key_id: "missing-key",
      },),
    },).where("message_id", "=", encMessageId,).execute();

    const messages: Record<string, unknown>[] = [{ id: encMessageId, chat_id: encChatId, },];
    await attachMessageTranslations(db, messages, "fr",);
    expect(messages[0]!["translation"],).toEqual({
      locale: "fr",
      content: "[Encrypted — unable to decrypt]",
    },);
  });

  /** */
  test("resolveAutoDisplayLocale prefers the chat content language", async () => {
    const resolved = await resolveAutoDisplayLocale(db, { chatId, userId: owner, },);
    expect(resolved,).toBe("en",);
  });

  /** */
  test("resolveAutoDisplayLocale falls back to the user content locale", async () => {
    const plainChatId = uid();
    await insertChats(db, "Plain Chat", owner, { id: plainChatId, } as never,);
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Reader", {
      id: userId,
      settings: JSON.stringify({ contentLocale: "fr", },),
    } as never,);

    const resolved = await resolveAutoDisplayLocale(db, { chatId: plainChatId, userId, },);
    expect(resolved,).toBe("fr",);
  });

  /** */
  test("resolveAutoDisplayLocale returns null when nothing resolves", async () => {
    const plainChatId = uid();
    await insertChats(db, "Plain Chat", owner, { id: plainChatId, } as never,);
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Reader", { id: userId, } as never,);

    const resolved = await resolveAutoDisplayLocale(db, { chatId: plainChatId, userId, },);
    expect(resolved,).toBeNull();
  });
});
