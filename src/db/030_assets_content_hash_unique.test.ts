// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema behavior for the asset dedupe key.
 *
 * The retired 030 migration backed (owner_id, content_hash, encryption_tier,
 * encrypted_key_id) with two partial unique indexes so concurrent identical
 * uploads cannot both land. In the 14-file baseline those indexes ship inline.
 * The migration-time dedupe/warning loop is unreachable against a final-schema
 * database; these tests assert the shipped constraint is live instead.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

describe("assets content-hash unique (final schema)", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    await applyBaseline(db,);
    await sql`INSERT INTO users (id, username, display_name, created_at)
      VALUES ('owner-1', 'owner-1', 'Owner One', datetime('now'))`.execute(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  /**
   * @param id asset id
   * @param contentHash dedupe hash, or null for a `dedupe: false` opt-out
   * @param encryptedKeyId null selects the public tier
   */
  async function insertAsset(
    id: string,
    contentHash: string | null,
    encryptedKeyId: string | null,
  ): Promise<void> {
    await sql`INSERT INTO assets
        (id, owner_id, filename, mime_type, asset_type, size_bytes, storage_path,
         content_hash, encryption_tier, encrypted_key_id, created_at)
      VALUES (${id}, 'owner-1', ${`${id}.png`}, 'image/png', 'image', 1,
              ${`/storage/${id}`}, ${contentHash},
              ${encryptedKeyId === null ? "public" : "encrypted"}, ${encryptedKeyId},
              datetime('now'))`.execute(db,);
  }

  test("both partial unique indexes are present", () => {
    const rows = raw
      .query("SELECT name, partial FROM pragma_index_list('assets')",)
      .all() as { name: string; partial: number }[];

    expect(rows.find((r,) => r.name === "uq_assets_owner_content_public")?.partial,).toBe(1,);
    expect(rows.find((r,) => r.name === "uq_assets_owner_content_keyed")?.partial,).toBe(1,);
  });

  test("a repeat public-tier upload of identical bytes is rejected", async () => {
    await insertAsset("a-first", "hash-public", null,);
    await expect(insertAsset("b-repeat", "hash-public", null,),).rejects.toThrow(/UNIQUE/i,);
  });

  test("a repeat keyed-tier upload of identical bytes is rejected", async () => {
    await insertAsset("a-first", "hash-keyed", "key-7",);
    await expect(insertAsset("b-repeat", "hash-keyed", "key-7",),).rejects.toThrow(/UNIQUE/i,);
  });

  test("a different tier or key remains a distinct dedupe key", async () => {
    await insertAsset("a-public", "hash", null,);
    await insertAsset("b-keyed", "hash", "key-9",);
    await expect(insertAsset("c-keyed-other", "hash", "key-10",),).resolves.toBeUndefined();
  });

  test("dedupe:false rows with NULL content_hash are never deduped", async () => {
    await insertAsset("a-nohash", null, null,);
    await insertAsset("b-nohash", null, null,);
    const { rows, } = await sql<{ id: string }>`SELECT id FROM assets WHERE content_hash IS NULL ORDER BY id`.execute(
      db,
    );

    expect(rows.map((r,) => r.id),).toEqual(["a-nohash", "b-nohash",],);
  });
});
