/**
 * Tests for crypto/e2e/key-bundle.ts — E2E key bundle encrypt/decrypt/store/load
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../../db/index";
import { up as migrate, } from "../../db/migrations/001_init";
import type { DB, } from "../../db/schema";
import {
  decryptChatKeyFromBundle,
  encryptChatKeyForUser,
  listBundleUsers,
  loadKeyBundle,
  removeKeyBundles,
  storeKeyBundle,
} from "./key-bundle";

const CHAT_ID = "chat-e2e-001";
const USER_ID = "user-e2e-001";
const USER_ID_2 = "user-e2e-002";

let db: Kysely<DB>;
let userKey: CryptoKey;

beforeAll(async () => {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  await migrate(db as unknown as Kysely<unknown>,);

  // Generate a user key for encryption/decryption
  userKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );
},);

afterAll(() => {
  db.destroy();
},);

// ── encryptChatKeyForUser / decryptChatKeyFromBundle ───────

describe("encryptChatKeyForUser / decryptChatKeyFromBundle", () => {
  test("round-trip: encrypt then decrypt returns original key", async () => {
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);
    const bundle = await encryptChatKeyForUser(chatKeyRaw, userKey, "user-key-001",);

    expect(bundle.algorithm,).toBe("aes-256-gcm",);
    expect(typeof bundle.encryptedChatKey,).toBe("string",);
    expect(typeof bundle.iv,).toBe("string",);

    const decrypted = await decryptChatKeyFromBundle(bundle, userKey,);

    expect(Array.from(decrypted,),).toEqual(Array.from(chatKeyRaw,),);
  });

  test("different chat keys produce different bundles", async () => {
    const key1 = crypto.getRandomValues(new Uint8Array(32,),);
    const key2 = crypto.getRandomValues(new Uint8Array(32,),);

    const bundle1 = await encryptChatKeyForUser(key1, userKey, "uk-001",);
    const bundle2 = await encryptChatKeyForUser(key2, userKey, "uk-002",);

    expect(bundle1.encryptedChatKey,).not.toBe(bundle2.encryptedChatKey,);
  });

  test("decryption fails with wrong user key", async () => {
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);
    const bundle = await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-003",);

    const wrongKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256, },
      true,
      ["encrypt", "decrypt",],
    );

    await expect(decryptChatKeyFromBundle(bundle, wrongKey,),).rejects.toThrow();
  });
});

// ── storeKeyBundle / loadKeyBundle ─────────────────────────

describe("storeKeyBundle / loadKeyBundle", () => {
  test("stores and loads a key bundle", async () => {
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);
    const bundle = await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-store-001",);

    const bundleId = await storeKeyBundle({ database: db, chatId: CHAT_ID, userId: USER_ID, bundle, },);
    expect(typeof bundleId,).toBe("string",);

    const loaded = await loadKeyBundle({ database: db, chatId: CHAT_ID, userId: USER_ID, },);
    expect(loaded,).not.toBeNull();
    expect(loaded!.algorithm,).toBe("aes-256-gcm",);
    expect(loaded!.encryptedChatKey,).toBe(bundle.encryptedChatKey,);
  });

  test("upsert: second store overwrites the first", async () => {
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);
    const bundle = await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-upsert-001",);

    const id1 = await storeKeyBundle({ database: db, chatId: "chat-upsert", userId: "user-upsert-001", bundle, },);

    const chatKeyRaw2 = crypto.getRandomValues(new Uint8Array(32,),);
    const bundle2 = await encryptChatKeyForUser(chatKeyRaw2, userKey, "uk-upsert-002",);
    const id2 = await storeKeyBundle({
      database: db,
      chatId: "chat-upsert",
      userId: "user-upsert-001",
      bundle: bundle2,
    },);

    expect(id1,).toBe(id2,);

    const loaded = await loadKeyBundle({ database: db, chatId: "chat-upsert", userId: "user-upsert-001", },);
    expect(loaded!.encryptedChatKey,).toBe(bundle2.encryptedChatKey,);
  });

  test("returns null for non-existent bundle", async () => {
    const loaded = await loadKeyBundle({ database: db, chatId: "chat-nonexistent", userId: "user-nonexistent", },);

    expect(loaded,).toBeNull();
  });
});

// ── listBundleUsers / removeKeyBundles ─────────────────────

describe("listBundleUsers / removeKeyBundles", () => {
  test("lists users with bundles for a chat", async () => {
    const chatId = "chat-list-users";
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);

    await storeKeyBundle({
      database: db,
      chatId,
      userId: USER_ID,
      bundle: await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-list-001",),
    },);
    await storeKeyBundle({
      database: db,
      chatId,
      userId: USER_ID_2,
      bundle: await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-list-002",),
    },);

    const users = await listBundleUsers(db, chatId,);

    expect(users.length,).toBe(2,);
    expect(users,).toContain(USER_ID,);
    expect(users,).toContain(USER_ID_2,);
  });

  test("removeKeyBundles removes all bundles for a chat", async () => {
    const chatId = "chat-remove";
    const chatKeyRaw = crypto.getRandomValues(new Uint8Array(32,),);

    await storeKeyBundle({
      database: db,
      chatId,
      userId: USER_ID,
      bundle: await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-remove-001",),
    },);
    await storeKeyBundle({
      database: db,
      chatId,
      userId: USER_ID_2,
      bundle: await encryptChatKeyForUser(chatKeyRaw, userKey, "uk-remove-002",),
    },);

    await removeKeyBundles(db, chatId,);

    const users = await listBundleUsers(db, chatId,);
    expect(users.length,).toBe(0,);
  });
});
