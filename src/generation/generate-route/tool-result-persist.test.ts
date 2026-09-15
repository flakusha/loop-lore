// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for encryptStoredContent — the shared encryption helper for
 * persisted message content (generation results and inline tool results).
 *
 * Covers both branches: encryption disabled (no SMK → plaintext + null key)
 * and enabled (standard-tier chat → ciphertext + key id, round-tripping
 * through the message decrypt path used by resolveMessageContent).
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { decryptMessageContent, generateActorKey, } from "../../crypto";
import { getSmk, initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { encryptStoredContent, } from "./tool-result-persist";

const VALID_HEX_KEY = "a".repeat(64,);
const CHAT_ID = "chat-encrypt-stored";
const ACTOR_ID = "actor-encrypt-stored";
const USER_ID = "user-encrypt-stored";

let db: Kysely<DB>;
let sqlite: Database;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;

  await db.insertInto("users",).values({
    id: USER_ID,
    username: "encryptstored",
    display_name: "Encrypt Stored",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();
  await insertActors(db, "Alice", {
    id: ACTOR_ID,
    actor_type: "character",
    owner_id: USER_ID,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_raw: null,
  } as never,);
  await db.insertInto("chats",).values({
    id: CHAT_ID,
    name: "Encrypt Stored",
    type: "direct",
    mode: "direct",
    created_by: USER_ID,
    encryption_level: "standard",
  } as never,).execute();
  await db.insertInto("chat_participants",).values({
    chat_id: CHAT_ID,
    actor_id: ACTOR_ID,
    role_in_chat: "member",
    talkativity: 5,
  } as never,).execute();
},);

afterEach(async () => {
  // Disarm SMK so the global never leaks into other suites.
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  sqlite.close();
},);

test("returns plaintext with a null key id when encryption is disabled", async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);

  const { storedContent, storedKeyId, } = await encryptStoredContent({
    database: db,
    chatId: CHAT_ID,
    actorId: ACTOR_ID,
    plaintext: '{"ok":true}',
  },);

  expect(storedContent,).toBe('{"ok":true}',);
  expect(storedKeyId,).toBeNull();
});

test("seals content under the chat key and round-trips when encryption is enabled", async () => {
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  await generateActorKey({ database: db, actorId: ACTOR_ID, smk, name: "primary", },);

  const plaintext = "tool output that must not leak";
  const { storedContent, storedKeyId, } = await encryptStoredContent({
    database: db,
    chatId: CHAT_ID,
    actorId: ACTOR_ID,
    plaintext,
  },);

  expect(storedKeyId,).toBeTruthy();
  expect(storedContent,).not.toBe(plaintext,);
  expect(storedContent,).not.toContain(plaintext,);

  // Round-trip through the same decrypt path resolveMessageContent uses
  // (key_id presence drives decryption, not content_encoding).
  const round = await decryptMessageContent(db, {
    content: storedContent,
    content_encoding: "identity",
    key_id: storedKeyId,
    chat_id: CHAT_ID,
  }, smk,);
  expect(round,).toBe(plaintext,);
});
