// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct coverage for `post.ts`: `prepareContentStorage` (client-pre-encrypted,
 * server-encryption, gzip and identity paths), `attachMessageAttachments`
 * (owned, non-owned and empty), and `persistMentions` (no mentions, persisted,
 * benign duplicate, non-benign insert failure, notify failure).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { attachMessageAttachments, persistMentions, prepareContentStorage, } from "./post";

const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;

/** Build a valid client-pre-encrypted envelope (12-byte nonce, base64 ciphertext). */
function encryptedPayload(keyId: string,): string {
  return JSON.stringify({
    enc: Buffer.from("ciphertext-bytes",).toString("base64",),
    nonce: Buffer.from(new Uint8Array(12,),).toString("base64",),
    algo: "aes-256-gcm",
    comp: false,
    key_id: keyId,
  },);
}

/**
 * Seed a user and its actor row (messages/participants FK to actors).
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, },);
  await insertActors(db, name, { id, actor_type: "user", user_id: id, owner_id: id, },);
}

/**
 * Proxy `db` so `insertInto(table)` rejects with `error`; every other call
 * delegates to the real handle (so mention parsing and notify still run).
 * @param db
 * @param table
 * @param error
 */
function withFailingInsert(db: Kysely<DB>, table: string, error: unknown,): Kysely<DB> {
  return new Proxy(db, {
    get(target, prop, receiver,) {
      if (prop === "insertInto") {
        return (name: string,) => {
          if (name === table) {
            return {
              values: () => ({
                execute: async () => {
                  throw error;
                },
              }),
            };
          }

          return (target.insertInto as (t: string,) => unknown).call(target, name,);
        };
      }

      const value = Reflect.get(target, prop, receiver,) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target,) : value;
    },
  },) as unknown as Kysely<DB>;
}

describe("post.ts", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const owner = "user-owner";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(() => {
    resetTestDb(sqlite,);
  },);

  describe("prepareContentStorage (encryption disabled)", () => {
    test("returns the payload untouched for client-pre-encrypted content", async () => {
      const payload = encryptedPayload("key-pre-1",);
      const result = await prepareContentStorage(db, testConfig, uid(), owner, payload,);

      expect(result.storedContent,).toBe(payload,);
      expect(result.contentEncoding,).toBe("identity",);
      expect(result.storedKeyId,).toBe("key-pre-1",);
      expect(result.storedPlaintext,).toBeNull();
    });

    test("gzips content above the large-content threshold", async () => {
      const long = "A".repeat(11_000,);
      const result = await prepareContentStorage(db, testConfig, uid(), owner, long,);

      expect(result.contentEncoding,).toBe("gzip",);
      expect(result.storedKeyId,).toBeNull();
      expect(result.storedPlaintext,).toBe(long,);
      expect(result.storedContent,).not.toBe(long,);
    });

    test("stores small content as identity", async () => {
      const result = await prepareContentStorage(db, testConfig, uid(), owner, "short body",);

      expect(result.storedContent,).toBe("short body",);
      expect(result.contentEncoding,).toBe("identity",);
      expect(result.storedKeyId,).toBeNull();
      expect(result.storedPlaintext,).toBe("short body",);
    });
  });

  describe("prepareContentStorage (SMK loaded)", () => {
    beforeAll(async () => {
      await initSmk({
        serverEncryptionKey: "c".repeat(64,),
        required: false,
        compressThreshold: 1024,
        compressAlgorithm: "gzip",
      },);
    },);

    afterAll(async () => {
      await initSmk({
        required: false,
        compressThreshold: 1024,
        compressAlgorithm: "gzip",
      },);
    },);

    test("encrypts at rest for a standard-tier chat", async () => {
      const actorId = uid();
      await seedUser(db, actorId, "Owner",);
      const chatId = uid();
      await insertChats(db, "Encrypted chat", actorId, { id: chatId, encryption_level: "standard", },);

      const result = await prepareContentStorage(db, testConfig, chatId, actorId, "secret body",);

      expect(result.storedKeyId,).not.toBeNull();
      expect(result.storedPlaintext,).toBe("secret body",);
      expect(result.contentEncoding,).toBe("identity",);
      expect(result.storedContent,).not.toBe("secret body",);
    });
  });

  describe("attachMessageAttachments", () => {
    test("sets an empty JSON list when there are no attachments", async () => {
      const chatId = uid();
      const messageId = uid();
      await seedUser(db, owner, "Owner",);
      await insertChats(db, "Attach chat", owner, { id: chatId, },);
      await insertMessages(db, chatId, owner, MessageRole.User, "hello", { id: messageId, },);

      await attachMessageAttachments(db, messageId, [], owner,);

      const row = await db.selectFrom("messages",).select("attachments",).where("id", "=", messageId,)
        .executeTakeFirst();

      expect(row?.attachments,).toBe("[]",);
    });

    test("links owned assets and persists the attachment JSON", async () => {
      const chatId = uid();
      const messageId = uid();
      const assetId = uid();
      await seedUser(db, owner, "Owner",);
      await insertChats(db, "Attach chat", owner, { id: chatId, },);
      await insertMessages(db, chatId, owner, MessageRole.User, "hello", { id: messageId, },);
      await insertAssets(db, owner, "a.png", "image/png", "image", 10, "/a.png", { id: assetId, },);

      await attachMessageAttachments(db, messageId, [{ assetId, },], owner,);

      const row = await db.selectFrom("messages",).select("attachments",).where("id", "=", messageId,)
        .executeTakeFirst();

      const parsed = JSON.parse(row?.attachments ?? "[]",) as { assetId: string; order: number }[];
      expect(parsed,).toHaveLength(1,);
      expect(parsed[0]?.assetId,).toBe(assetId,);
      expect(parsed[0]?.order,).toBe(0,);
    });

    test("rejects an asset the caller does not own", async () => {
      const chatId = uid();
      const messageId = uid();
      const assetId = uid();
      await seedUser(db, owner, "Owner",);
      await seedUser(db, "user-other", "Other",);
      await insertChats(db, "Attach chat", owner, { id: chatId, },);
      await insertMessages(db, chatId, owner, MessageRole.User, "hello", { id: messageId, },);
      await insertAssets(db, "user-other", "b.png", "image/png", "image", 10, "/b.png", { id: assetId, },);

      await expect(attachMessageAttachments(db, messageId, [{ assetId, },], owner,),).rejects.toThrow();
    });
  });

  describe("persistMentions", () => {
    /**
     * Seed a chat with `owner` plus `luna`, and one message to mention from.
     * @param opts.withLunaUser whether Luna also gets a `users` row (notify succeeds)
     */
    async function seedMentionFixture(opts?: { withLunaUser?: boolean },): Promise<{
      chatId: string;
      messageId: string;
      lunaId: string;
    }> {
      const withLunaUser = opts?.withLunaUser ?? true;
      await seedUser(db, owner, "Owner",);
      const lunaId = uid();
      if (withLunaUser) {
        await seedUser(db, lunaId, "Luna",);
      } else {
        await insertActors(db, "Luna", { id: lunaId, },);
      }

      const chatId = uid();
      await insertChats(db, "Mention chat", owner, { id: chatId, },);
      await insertChatParticipants(db, chatId, owner,);
      await insertChatParticipants(db, chatId, lunaId,);
      const messageId = uid();
      await insertMessages(db, chatId, owner, MessageRole.User, "hi @Luna", { id: messageId, },);
      return { chatId, messageId, lunaId, };
    }

    test("returns zero counts when nothing is mentioned", async () => {
      const { chatId, messageId, } = await seedMentionFixture();

      const result = await persistMentions(db, chatId, owner, messageId, "no mentions here",);

      expect(result,).toEqual({ persisted: 0, notified: 0, failed: 0, },);
    });

    test("persists and notifies a mentioned participant", async () => {
      const { chatId, messageId, lunaId, } = await seedMentionFixture();

      const result = await persistMentions(db, chatId, owner, messageId, "hey @Luna",);

      expect(result,).toEqual({ persisted: 1, notified: 1, failed: 0, },);
      const mentions = await db.selectFrom("chat_mentions",).select("actor_id",).where("message_id", "=", messageId,)
        .execute();

      expect(mentions,).toHaveLength(1,);
      expect(mentions[0]?.actor_id,).toBe(lunaId,);
      const notes = await db.selectFrom("notifications",).select("user_id",).where("user_id", "=", lunaId,).execute();
      expect(notes,).toHaveLength(1,);
    });

    test("treats a unique-constraint insert failure as a benign duplicate", async () => {
      const { chatId, messageId, } = await seedMentionFixture();
      const dupDb = withFailingInsert(db, "chat_mentions", new Error("UNIQUE constraint failed: chat_mentions.id",),);

      const result = await persistMentions(dupDb, chatId, owner, messageId, "hey @Luna",);

      expect(result,).toEqual({ persisted: 1, notified: 1, failed: 0, },);
    });

    test("counts a non-benign insert failure as failed and skips notify", async () => {
      const { chatId, messageId, } = await seedMentionFixture();
      const brokenDb = withFailingInsert(db, "chat_mentions", "disk I/O error",);

      const result = await persistMentions(brokenDb, chatId, owner, messageId, "hey @Luna",);

      expect(result,).toEqual({ persisted: 0, notified: 0, failed: 1, },);
      const mentions = await db.selectFrom("chat_mentions",).select("id",).where("message_id", "=", messageId,)
        .execute();

      expect(mentions,).toHaveLength(0,);
    });

    test("counts a notification failure against the persisted actor", async () => {
      const { chatId, messageId, } = await seedMentionFixture({ withLunaUser: false, },);

      const result = await persistMentions(db, chatId, owner, messageId, "hey @Luna",);

      expect(result,).toEqual({ persisted: 1, notified: 0, failed: 1, },);
    });
  });
});
