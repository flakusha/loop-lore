/**
 * Tests for crypto/actor-keys.ts — Actor key CRUD
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { createSqliteDialect } from "../db/index";
import { up as migrate } from "../db/migrations/001_init";
import type { DB } from "../db/schema";
import {
  generateActorKey,
  ensureActorKey,
  loadActorKeys,
  getActorKey,
  rotateActorKey,
  revokeActorKey,
  listActorKeys,
} from "./actor-keys";
import { initSmk } from "./smk";

const VALID_HEX_KEY = "a".repeat(64);
const ACTOR_ID = "actor-test-001";

let db: Kysely<DB>;

beforeAll(async () => {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = OFF");
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite) });
  await migrate(db as unknown as Kysely<unknown>);
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  });
});

afterAll(async () => {
  // Reset SMK to prevent pollution of other test suites
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip" });
  db.destroy();
});

import { getSmk } from "./smk";

function getSmkKeySafe(): CryptoKey {
  const key = getSmk();
  if (!key) throw new Error("SMK not loaded — test setup failed");
  return key;
}

describe("generateActorKey", () => {
  test("generates a key and stores it encrypted in DB", async () => {
    const smk = getSmkKeySafe();
    const keyId = await generateActorKey(db, ACTOR_ID, smk, "primary");

    expect(keyId).toBeTruthy();
    expect(typeof keyId).toBe("string");

    // Verify it exists in DB
    const row = await db
      .selectFrom("actor_keys")
      .select(["id", "actor_id", "name", "key_type", "status"])
      .where("id", "=", keyId)
      .executeTakeFirst();

    expect(row).not.toBeNull();
    expect(row!.actor_id).toBe(ACTOR_ID);
    expect(row!.name).toBe("primary");
    expect(row!.key_type).toBe("primary");
    expect(row!.status).toBe("active");
  });

  test("generates unique key IDs on each call", async () => {
    const smk = getSmkKeySafe();
    const id1 = await generateActorKey(db, ACTOR_ID, smk, "key-a");
    const id2 = await generateActorKey(db, ACTOR_ID, smk, "key-b");
    expect(id1).not.toBe(id2);
  });
});

describe("ensureActorKey", () => {
  test("returns existing active key ID when one exists", async () => {
    const smk = getSmkKeySafe();
    // First, make sure there's an active key
    const existingId = await generateActorKey(db, "actor-ensure", smk, "primary");
    const ensuredId = await ensureActorKey(db, "actor-ensure", smk);
    expect(ensuredId).toBe(existingId);
  });

  test("generates new key when no active key exists", async () => {
    const smk = getSmkKeySafe();
    const newId = await ensureActorKey(db, "actor-no-key", smk);
    expect(newId).toBeTruthy();

    const row = await db.selectFrom("actor_keys").select("status").where("id", "=", newId).executeTakeFirst();
    expect(row!.status).toBe("active");
  });
});

describe("loadActorKeys", () => {
  test("loads and decrypts active keys for actor IDs", async () => {
    const smk = getSmkKeySafe();
    const actorId = "actor-load-test";
    await generateActorKey(db, actorId, smk, "primary");

    const keys = await loadActorKeys(db, [actorId], smk);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[0].actorId).toBe(actorId);
    expect(keys[0].rawKey).toBeInstanceOf(Uint8Array);
    expect(keys[0].rawKey.length).toBe(32); // 256-bit key
    expect(keys[0].status).toBe("active");
  });

  test("returns empty array for empty actor ID list", async () => {
    const smk = getSmkKeySafe();
    const keys = await loadActorKeys(db, [], smk);
    expect(keys).toEqual([]);
  });

  test("returns empty array for actor with no keys", async () => {
    const smk = getSmkKeySafe();
    const keys = await loadActorKeys(db, ["actor-nonexistent"], smk);
    expect(keys).toEqual([]);
  });

  test("returns keys sorted by actor_id", async () => {
    const smk = getSmkKeySafe();
    await generateActorKey(db, "actor-a", smk, "primary");
    await generateActorKey(db, "actor-b", smk, "primary");

    const keys = await loadActorKeys(db, ["actor-b", "actor-a"], smk);
    const actorIds = keys.map((k) => k.actorId);
    // Should be sorted by actor_id ascending: a before b
    expect(actorIds).toEqual(["actor-a", "actor-b"]);
  });
});

describe("getActorKey", () => {
  test("returns a single key by ID", async () => {
    const smk = getSmkKeySafe();
    const keyId = await generateActorKey(db, "actor-single", smk, "primary");

    const key = await getActorKey(db, keyId, smk);
    expect(key).not.toBeNull();
    expect(key!.keyId).toBe(keyId);
    expect(key!.actorId).toBe("actor-single");
    expect(key!.rawKey).toBeInstanceOf(Uint8Array);
  });

  test("returns null for unknown key ID", async () => {
    const smk = getSmkKeySafe();
    const key = await getActorKey(db, "nonexistent-key-id", smk);
    expect(key).toBeNull();
  });
});

describe("rotateActorKey", () => {
  test("expires old key and generates new active key", async () => {
    const smk = getSmkKeySafe();
    const actorId = "actor-rotate";
    const oldKeyId = await generateActorKey(db, actorId, smk, "primary");

    const newKeyId = await rotateActorKey(db, actorId, smk);
    expect(newKeyId).not.toBe(oldKeyId);

    // Old key should be expired
    const oldRow = await db
      .selectFrom("actor_keys")
      .select("status")
      .where("id", "=", oldKeyId)
      .executeTakeFirst();
    expect(oldRow!.status).toBe("expired");

    // New key should be active
    const newRow = await db
      .selectFrom("actor_keys")
      .select("status")
      .where("id", "=", newKeyId)
      .executeTakeFirst();
    expect(newRow!.status).toBe("active");
  });
});

describe("revokeActorKey", () => {
  test("sets key status to revoked", async () => {
    const smk = getSmkKeySafe();
    const keyId = await generateActorKey(db, "actor-revoke", smk, "primary");

    await revokeActorKey(db, keyId);

    const row = await db.selectFrom("actor_keys").select("status").where("id", "=", keyId).executeTakeFirst();
    expect(row).not.toBeNull();
    expect(row!.status).toBe("revoked");
  });

  test("revoking unknown key does not throw", async () => {
    await expect(revokeActorKey(db, "nonexistent-key")).resolves.toBeUndefined();
  });
});

describe("listActorKeys", () => {
  test("returns metadata for all keys of an actor (no key material)", async () => {
    const smk = getSmkKeySafe();
    const actorId = "actor-list";
    await generateActorKey(db, actorId, smk, "primary");
    await generateActorKey(db, actorId, smk, "backup");

    const keys = await listActorKeys(db, actorId);
    expect(keys.length).toBeGreaterThanOrEqual(2);

    for (const key of keys) {
      expect(key.actorId).toBe(actorId);
      expect(key.id).toBeTruthy();
      expect(key.name).toBeTruthy();
      expect(key.keyType).toBeTruthy();
      expect(key.status).toBeTruthy();
      expect(key.createdAt).toBeTruthy();
      // No rawKey exposed in metadata
      expect((key as unknown as Record<string, unknown>).rawKey).toBeUndefined();
    }
  });

  test("returns empty array for actor with no keys", async () => {
    const keys = await listActorKeys(db, "actor-no-list");
    expect(keys).toEqual([]);
  });
});
