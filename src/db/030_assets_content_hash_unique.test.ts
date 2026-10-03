// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 030 — unique dedupe key on
 * (owner_id, content_hash, encryption_tier, encrypted_key_id).
 *
 * Before 030 the key was only enforced by a check-then-act pre-read
 * (src/assets/service/create.ts), so concurrent identical uploads could both
 * land. 030 backs the key with two partial unique indexes and first collapses
 * any duplicate rows a pre-fix database already accumulated — that collapse
 * loop is the only code path a clean database never reaches (`dupes.rows` is
 * empty), so it is what this file forces.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createLogger, } from "../logger";
import { captureWarnings, } from "../test-utils/capture-warnings";
import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";
import type { DB, } from "./schema";

const MIGRATION = "030_assets_content_hash_unique";

/**
 * Foreign half of the cross-file warning race. `bun test` runs every test file
 * in ONE process, so this emitter's warnings dispatch to a capture window
 * opened by a DIFFERENT file - `032_chat_branches_name_unique.test.ts` runs it
 * while its own exact-count capture is open. The emitter is deliberately
 * UNBOUNDED for the whole of this file: if the capture scopes to its own async
 * context, none of these reach that capture's result and the assertion there
 * holds; if it does not, they arrive continuously for the whole window and the
 * count is destroyed. A burst emitter would not prove that - the point is that
 * the foreign stream is continuous, so no drain can "miss" it.
 *
 * The two files share only this global handle, not an import, so the coupling is
 * the warning stream itself. Both halves must run in the same `bun test`
 * invocation to mean anything; `bun test src/db/` runs them together.
 *
 * Resource contract: this file owns a process-wide timer for its own lifetime.
 * `032` disposes it in ITS `afterAll` - the first teardown that runs after 032's
 * tests - because 030 is the alphabetically earlier file and its own teardown
 * would fire while 032, which loads later, has not opened its window yet. If
 * 032 is not in the invocation, the timer outlives this file and keeps the
 * process alive emitting warnings, so it is unref'd: it then never holds the
 * event loop open, and a process with no other work still exits.
 */
const FOREIGN_EMITTER = "__ll_foreign_warning_emitter__";
let foreignTicks = 0;
const foreignTimer: ReturnType<typeof setInterval> = setInterval(() => {
  process.emitWarning(`[foreign-emitter] background tick ${foreignTicks++}`,);
}, 1,);
// Unref'd so an unpaired run (030 alone) cannot hang on this timer.
foreignTimer.unref?.();
// Published as a disposer, not the handle: the peer file gets a callable with
// no cast and no way to misuse the timer.
(globalThis as Record<string, unknown>)[FOREIGN_EMITTER] = (): void => {
  clearInterval(foreignTimer,);
};

function makeInMemoryDb(): { kysely: Kysely<DB>; raw: Database } {
  const raw = new Database(":memory:",);
  const kysely = new Kysely<DB>({ dialect: createSqliteDialect(raw,), },);
  return { kysely, raw, };
}

describe(MIGRATION, () => {
  let db: Kysely<DB>;
  let raw: Database;

  beforeEach(async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Logger already initialized — ignore.
    }
    const fresh = makeInMemoryDb();
    db = fresh.kysely;
    raw = fresh.raw;
    // Apply every migration except 030, so assets is in its pre-migration
    // shape: bare nullable content_hash, no dedupe index, duplicates allowed.
    const migrations = await getMigrationFiles();
    for (const name of Object.keys(migrations,).sort()) {
      if (name === MIGRATION) { continue; }
      await migrations[name]!.up(db,);
    }
    await sql`INSERT INTO users (id, username, display_name, created_at)
      VALUES ('owner-1', 'owner-1', 'Owner One', datetime('now'))`.execute(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  /**
   * @param id asset id
   * @param createdAt insertion timestamp — oldest row survives the collapse
   * @param contentHash dedupe hash, or null for a `dedupe: false` opt-out
   * @param encryptedKeyId null selects the public tier
   */
  async function insertAsset(
    id: string,
    createdAt: string,
    contentHash: string | null,
    encryptedKeyId: string | null,
  ): Promise<void> {
    await sql`INSERT INTO assets
        (id, owner_id, filename, mime_type, asset_type, size_bytes, storage_path,
         content_hash, encryption_tier, encrypted_key_id, created_at)
      VALUES (${id}, 'owner-1', ${`${id}.png`}, 'image/png', 'image', 1,
              ${`/storage/${id}`}, ${contentHash},
              ${encryptedKeyId === null ? "public" : "encrypted"}, ${encryptedKeyId},
              ${createdAt})`.execute(db,);
  }

  /**
   * @param contentHash
   * @param encryptedKeyId
   */
  async function idsFor(contentHash: string | null, encryptedKeyId: string | null,): Promise<string[]> {
    const rows = await sql<{ id: string }>`SELECT id FROM assets
      WHERE content_hash IS ${contentHash} AND encrypted_key_id IS ${encryptedKeyId}
      ORDER BY id`.execute(db,);
    return rows.rows.map((r,) => r.id);
  }

  test("collapses duplicate groups to the oldest row, warns, then enforces both partial indexes", async () => {
    // Public tier, three byte-identical rows — the shape the ticket recorded
    // from concurrent createAsset calls.
    await insertAsset("a-oldest", "2026-01-01 00:00:00", "hash-public", null,);
    await insertAsset("b-middle", "2026-01-02 00:00:00", "hash-public", null,);
    await insertAsset("c-newest", "2026-01-03 00:00:00", "hash-public", null,);
    // Keyed tier, two byte-identical rows — exercises the non-NULL
    // encrypted_key_id branch of the group key.
    await insertAsset("d-keyed-old", "2026-01-01 00:00:00", "hash-keyed", "key-7",);
    await insertAsset("e-keyed-new", "2026-01-02 00:00:00", "hash-keyed", "key-7",);
    // Same owner + content, different tier: a distinct key, must survive.
    await insertAsset("f-other-tier", "2026-01-01 00:00:00", "hash-public", "key-9",);
    // `dedupe: false` callers store NULL content_hash — never collapsed.
    await insertAsset("g-nohash-a", "2026-01-01 00:00:00", null, null,);
    await insertAsset("h-nohash-b", "2026-01-02 00:00:00", null, null,);

    // Scoped to this migration's own tag: `warning` is process-wide, so an
    // unrelated emitter warning during this window would otherwise land in
    // `warnings` and break the exact count asserted below.
    const warnings = await captureWarnings(async () => {
      const migrations = await getMigrationFiles();
      const migration = migrations[MIGRATION];
      if (!migration) { throw new Error("migration 030 not registered",); }
      await migration.up(db,);
    }, new RegExp(`^\\[${MIGRATION}\\]`,),);

    // Each duplicate group collapses to its oldest row — the one that owns the
    // storage_path any surviving reference points at.
    expect(await idsFor("hash-public", null,),).toEqual(["a-oldest",],);
    expect(await idsFor("hash-keyed", "key-7",),).toEqual(["d-keyed-old",],);
    const survivor = await sql<{ storage_path: string }>`SELECT storage_path FROM assets WHERE id = 'a-oldest'`.execute(
      db,
    );
    expect(survivor.rows[0]?.storage_path,).toBe("/storage/a-oldest",);
    // Rows outside a duplicate group are untouched by the collapse.
    expect(await idsFor("hash-public", "key-9",),).toEqual(["f-other-tier",],);
    expect(await idsFor(null, null,),).toEqual(["g-nohash-a", "h-nohash-b",],);

    // One warning per collapsed group, naming the owner and the row count.
    expect(warnings,).toHaveLength(2,);
    expect(warnings.some((w,) => /owner-1 has 3 rows .*tier public/.test(w,)),).toBe(true,);
    expect(warnings.some((w,) => /owner-1 has 2 rows .*tier encrypted/.test(w,)),).toBe(true,);

    // Both partial indexes exist — one per nullable encrypted_key_id half.
    const indexRows = raw.query("PRAGMA index_list(assets)",).all() as { name: string }[];
    const indexNames = indexRows.map((r,) => r.name);
    expect(indexNames,).toContain("uq_assets_owner_content_keyed",);
    expect(indexNames,).toContain("uq_assets_owner_content_public",);

    // And they are enforced: a repeat upload of the same bytes now aborts.
    await expect(
      insertAsset("i-dup-public", "2026-01-04 00:00:00", "hash-public", null,),
    ).rejects.toThrow(/UNIQUE/i,);
    await expect(
      insertAsset("j-dup-keyed", "2026-01-04 00:00:00", "hash-keyed", "key-7",),
    ).rejects.toThrow(/UNIQUE/i,);
    // The `dedupe: false` opt-out still works with the indexes in place.
    await insertAsset("k-nohash-after", "2026-01-05 00:00:00", null, null,);
    expect(await idsFor(null, null,),).toContain("k-nohash-after",);
  });
},);
