/**
 * Integration tests for crypto/e2e/server-registry.ts — actor E2E public-key
 * CRUD against an in-memory SQLite DB with all migrations applied.
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { type Migration, Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createSqliteDialect, } from "../../db";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import {
  getActivePublicKey,
  listActivePublicKeys,
  registerPublicKey,
  revokePublicKey,
} from "./server-registry";

const OWNER_ID = "owner-e2e-001";
const OWNER_USER_ID = "owner-e2e-user-001";
const OTHER_ACTOR_ID = "other-e2e-001";
const OTHER_USER_ID = "other-e2e-user-001";

/** */
function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const migrationDir = path.join(__dirname, "..", "..", "db", "migrations",);
      const migrationFiles = readdirSync(migrationDir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of migrationFiles) {
        // Dynamic import: the migration filename is runtime-selected from
        // readdirSync. A static import would require hardcoding every
        // migration filename — unmaintainable as the count grows.
        const mod = await import(path.join(migrationDir, f,));
        migrations[f.endsWith(".ts",) ? f.slice(0, -3,) : f] = mod.default !== undefined ? mod.default : mod;
      }
      return migrations;
    },
  };
}

/**
 * @param db
 * @param id
 * @param userId
 */
async function seedActor(db: Kysely<DB>, id: string, userId: string,): Promise<void> {
  await db.insertInto("users",).values({
    id: userId,
    username: userId,
    display_name: userId,
    password_hash: "dummy",
  },).execute();
  await db.insertInto("actors",).values({
    id,
    actor_type: "user",
    display_name: id,
    user_id: userId,
    owner_id: userId,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    format_version: 0,
    visibility: "private",
  },).execute();
}

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }

  await seedActor(db, OWNER_ID, OWNER_USER_ID,);
  await seedActor(db, OTHER_ACTOR_ID, OTHER_USER_ID,);
},);

beforeEach(async () => {
  await sql`DELETE FROM actor_e2e_pubkeys`.execute(db,);
},);

afterAll(async () => {
  db.destroy();
},);

// ── Helpers ────────────────────────────────────────────────

/**
 * @param seed
 */
function sampleJwk(seed: number,): JsonWebKey {
  // Deterministic but distinct per-seed value in `x` so we can tell rows apart.
  const x = `0${seed.toString(16,).padStart(63, "0",)}`;
  return {
    kty: "EC",
    crv: "P-256",
    x,
    y: "0".repeat(64,),
  };
}

describe("registerPublicKey", () => {
  test("registers a new public key and returns the stored row", async () => {
    const row = await registerPublicKey({
      database: db,
      actorId: OWNER_ID,
      publicKeyJwk: sampleJwk(1,),
    },);
    expect(row.actorId,).toBe(OWNER_ID,);
    expect(row.algorithm,).toBe("ECDH-P256",);
    expect(row.publicKeyJwk.x,).toBe(sampleJwk(1,).x,);
    expect(row.revokedAt,).toBeNull();
  });

  test("rotation replaces the active row (old is soft-revoked)", async () => {
    const first = await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(1,), },);
    const second = await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(2,), },);

    expect(second.id,).not.toBe(first.id,);

    const active = await getActivePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(active?.id,).toBe(second.id,);
    expect(active?.publicKeyJwk.x,).toBe(sampleJwk(2,).x,);

    // The first row stays in the table, soft-revoked.
    const historical = await db.selectFrom("actor_e2e_pubkeys",).selectAll().where("id", "=", first.id,)
      .executeTakeFirstOrThrow();
    expect(historical.revoked_at,).not.toBeNull();
  });

  test("rotation preserves an already-revoked row's revoked_at (no overwrite)", async () => {
    const first = await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(1,), },);
    // Manually set revoked_at to a known timestamp.
    await db.updateTable("actor_e2e_pubkeys",).set({ revoked_at: "2026-01-01 00:00:00", },).where("id", "=", first.id,)
      .execute();

    // Now rotate. The COALESCE in the soft-revoke should keep the old timestamp.
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(2,), },);
    const firstRow = await db.selectFrom("actor_e2e_pubkeys",).selectAll().where("id", "=", first.id,)
      .executeTakeFirstOrThrow();
    expect(firstRow.revoked_at,).toBe("2026-01-01 00:00:00",);
  });

  test("rotation leaves exactly one active row per actor (old is soft-revoked)", async () => {
    const first = await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(1,), },);
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(2,), },);
    const activeRows = await db
      .selectFrom("actor_e2e_pubkeys",)
      .selectAll()
      .where("actor_id", "=", OWNER_ID,)
      .where("revoked_at", "is", null,)
      .execute();
    expect(activeRows.length,).toBe(1,);
    expect(activeRows[0]?.id,).not.toBe(first.id,);
  });
  test("returns null when no key registered", async () => {
    const row = await getActivePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(row,).toBeNull();
  });

  test("returns the active row after registration", async () => {
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(7,), },);
    const row = await getActivePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(row?.publicKeyJwk.x,).toBe(sampleJwk(7,).x,);
  });

  test("returns null after revoke", async () => {
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(7,), },);
    await revokePublicKey({ database: db, actorId: OWNER_ID, },);
    const row = await getActivePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(row,).toBeNull();
  });
});

describe("listActivePublicKeys", () => {
  test("returns empty array when no actors have keys", async () => {
    const rows = await listActivePublicKeys({ database: db, actorIds: [OWNER_ID, OTHER_ACTOR_ID,], },);
    expect(rows,).toEqual([],);
  });

  test("skips actors with no active key (partial results allowed)", async () => {
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(11,), },);
    // OTHER_ACTOR_ID has no key registered yet.
    const rows = await listActivePublicKeys({ database: db, actorIds: [OWNER_ID, OTHER_ACTOR_ID,], },);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.actorId,).toBe(OWNER_ID,);
  });

  test("returns rows in insertion order", async () => {
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(21,), },);
    await registerPublicKey({ database: db, actorId: OTHER_ACTOR_ID, publicKeyJwk: sampleJwk(22,), },);
    const rows = await listActivePublicKeys({ database: db, actorIds: [OWNER_ID, OTHER_ACTOR_ID,], },);
    expect(rows.length,).toBe(2,);
    expect(rows.map((r,) => r.actorId),).toEqual([OWNER_ID, OTHER_ACTOR_ID,],);
  });
});

describe("revokePublicKey", () => {
  test("returns true on first revoke, false on idempotent re-revoke", async () => {
    await registerPublicKey({ database: db, actorId: OWNER_ID, publicKeyJwk: sampleJwk(99,), },);
    const first = await revokePublicKey({ database: db, actorId: OWNER_ID, },);
    const second = await revokePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(first,).toBe(true,);
    expect(second,).toBe(false,);
  });

  test("returns false when actor has no key registered", async () => {
    const result = await revokePublicKey({ database: db, actorId: OWNER_ID, },);
    expect(result,).toBe(false,);
  });
});
