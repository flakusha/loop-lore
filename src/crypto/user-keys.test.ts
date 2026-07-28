/* eslint-disable sonarjs/no-hardcoded-passwords -- all passwords in this file are test fixtures */
/**
 * Tests for crypto/user-keys.ts — Argon2id password-based key derivation
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../db/index";
import { up as migrate, } from "../db/migrations/001_init";
import type { DB, } from "../db/schema";
import {
  deriveUserKey,
  hasUserKey,
  revokeUserKey,
  storeUserKey,
  verifyPassphrase,
} from "./user-keys";

const USER_ID = "user-test-001";
const PASSPHRASE = "my-secret-passphrase-2024";

let db: Kysely<DB>;

beforeAll(async () => {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  await migrate(db as unknown as Kysely<unknown>,);
},);

afterAll(() => {
  db.destroy();
},);

// ── storeUserKey ───────────────────────────────────────────

describe("storeUserKey", () => {
  test("stores a new user key and returns key ID", async () => {
    const keyId = await storeUserKey({ database: db, userId: USER_ID, passphrase: PASSPHRASE, },);

    expect(typeof keyId,).toBe("string",);
    expect(keyId.length,).toBeGreaterThan(0,);
  });

  test("updates existing key on second call (upsert)", async () => {
    const keyId1 = await storeUserKey({ database: db, userId: "user-upsert-001", passphrase: "pass-v1", },);
    const keyId2 = await storeUserKey({ database: db, userId: "user-upsert-001", passphrase: "pass-v2", },);

    expect(keyId1,).toBe(keyId2,);
  });

  test("different users get different key IDs", async () => {
    const keyId1 = await storeUserKey({ database: db, userId: "user-multi-001", passphrase: "pass-1", },);
    const keyId2 = await storeUserKey({ database: db, userId: "user-multi-002", passphrase: "pass-2", },);

    expect(keyId1,).not.toBe(keyId2,);
  });
});

// ── verifyPassphrase ───────────────────────────────────────

describe("verifyPassphrase", () => {
  test("returns true for correct passphrase", async () => {
    await storeUserKey({ database: db, userId: "user-verify-001", passphrase: "correct-pass", },);
    const valid = await verifyPassphrase({ database: db, userId: "user-verify-001", passphrase: "correct-pass", },);

    expect(valid,).toBe(true,);
  });

  test("returns false for wrong passphrase", async () => {
    await storeUserKey({ database: db, userId: "user-verify-002", passphrase: "correct-pass", },);
    const valid = await verifyPassphrase({ database: db, userId: "user-verify-002", passphrase: "wrong-pass", },);

    expect(valid,).toBe(false,);
  });

  test("returns false for non-existent user", async () => {
    const valid = await verifyPassphrase({ database: db, userId: "user-nonexistent", passphrase: "any", },);

    expect(valid,).toBe(false,);
  });
});

// ── deriveUserKey ──────────────────────────────────────────

describe("deriveUserKey", () => {
  test("derives a 32-byte key from correct passphrase", async () => {
    const userId = "user-derive-001";
    await storeUserKey({ database: db, userId, passphrase: PASSPHRASE, },);
    const result = await deriveUserKey({ database: db, userId, passphrase: PASSPHRASE, },);

    expect(result.rawKey.length,).toBe(32,);
    expect(result.userId,).toBe(userId,);
    expect(typeof result.keyId,).toBe("string",);
  });

  test("throws on incorrect passphrase", async () => {
    const userId = "user-derive-002";
    await storeUserKey({ database: db, userId, passphrase: "correct", },);

    await expect(deriveUserKey({ database: db, userId, passphrase: "wrong", },),).rejects.toThrow(
      "Invalid passphrase",
    );
  });

  test("derivation is deterministic (same passphrase → same key)", async () => {
    const userId = "user-derive-003";
    await storeUserKey({ database: db, userId, passphrase: PASSPHRASE, },);

    const r1 = await deriveUserKey({ database: db, userId, passphrase: PASSPHRASE, },);
    const r2 = await deriveUserKey({ database: db, userId, passphrase: PASSPHRASE, },);

    expect(Array.from(r1.rawKey,),).toEqual(Array.from(r2.rawKey,),);
  });

  test("different passphrases produce different keys", async () => {
    const userId = "user-derive-004";
    await storeUserKey({ database: db, userId, passphrase: "passphrase-A", },);

    const r1 = await deriveUserKey({ database: db, userId, passphrase: "passphrase-A", },);
    // Store a new passphrase for the same user
    await storeUserKey({ database: db, userId, passphrase: "passphrase-B", },);
    const r2 = await deriveUserKey({ database: db, userId, passphrase: "passphrase-B", },);

    expect(Array.from(r1.rawKey,),).not.toEqual(Array.from(r2.rawKey,),);
  });
});

// ── revokeUserKey / hasUserKey ─────────────────────────────

describe("revokeUserKey / hasUserKey", () => {
  test("hasUserKey returns true after storeUserKey", async () => {
    const userId = "user-revoke-001";
    await storeUserKey({ database: db, userId, passphrase: PASSPHRASE, },);
    const exists = await hasUserKey(db, userId,);

    expect(exists,).toBe(true,);
  });

  test("hasUserKey returns false for non-existent user", async () => {
    const exists = await hasUserKey(db, "user-revoke-nonexistent",);

    expect(exists,).toBe(false,);
  });

  test("revokeUserKey sets status to revoked", async () => {
    const userId = "user-revoke-002";
    await storeUserKey({ database: db, userId, passphrase: PASSPHRASE, },);
    expect(await hasUserKey(db, userId,),).toBe(true,);

    await revokeUserKey(db, userId,);
    const exists = await hasUserKey(db, userId,);

    expect(exists,).toBe(false,);
  });

  test("revoked key cannot derive", async () => {
    const userId = "user-revoke-003";
    await storeUserKey({ database: db, userId, passphrase: PASSPHRASE, },);
    await revokeUserKey(db, userId,);

    await expect(deriveUserKey({ database: db, userId, passphrase: PASSPHRASE, },),).rejects.toThrow();
  });
});
