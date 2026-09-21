// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/scripts/migrate-character-legacy.ts
//
// Idempotent migration: backfills safe structural defaults for legacy V1
// character extensions after the unified InventoryItem / CharacterRelationship
// shapes were promoted (commit 98f8d5855).
//
// What it does:
//   1. Iterates actors in the DB.
//   2. Reads `data_raw` (the imported card JSON) when present.
//   3. Normalizes `extensions.inventory[*]` and `extensions.relationships[*]`
//      with safe defaults — never fabricates fields the source didn't hint at.
//   4. Writes `data_raw` back only when a change was made (idempotent).
//
// What it does NOT do:
//   - Synthesize rarity/weight/value/type from freeform text (explicit
//     author opt-in only).
//   - Touch the `settings` JSON blob (UI persona state, not character data).
//   - Touch columns other than `data_raw` on the `actors` table.

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../utils/safe-json";

/**
 * Result of normalizing a single `data_raw` payload.
 * - `changed`: true if any field was added
 * - `fieldsAdded`: names of extension fields newly populated
 * - `next`: the (possibly modified) payload to write back, or null when input was not JSON
 */
export interface MigrationStep {
  changed: boolean;
  fieldsAdded: string[];
  next: Record<string, unknown> | null;
}

/** Migrate a single canonical character's extensions in-place.
 *
 *  Defaults applied (only when absent — never overwrite):
 *    - `extensions.relationships[*].target_type` = "character"
 *      when `target_character_id` is present and `target_type` is undefined
 *
 *  Inventory items are left as-is (no fabricated rarity/weight/value).
 */
export function migrateCanonicalExtensions(
  payload: Record<string, unknown>,
): MigrationStep {
  const ext = (payload.extensions ?? {}) as Record<string, unknown>;
  const fieldsAdded: string[] = [];

  // ── Relationships ───────────────────────────────────────
  const rels = Array.isArray(ext.relationships,) ? ext.relationships as Record<string, unknown>[] : null;
  if (rels) {
    for (const r of rels) {
      if (
        typeof r === "object" && r !== null &&
        r.target_type === undefined &&
        r.target_character_id !== undefined
      ) {
        r.target_type = "character";
        fieldsAdded.push("relationships[].target_type",);
      }
    }
  }

  const changed = fieldsAdded.length > 0;
  if (!changed) {
    return { changed: false, fieldsAdded: [], next: payload, };
  }

  // Only attach the extensions object when at least one default was added.
  // We mutate `payload` in place but also re-attach for safety.
  payload.extensions = ext;
  return { changed: true, fieldsAdded, next: payload, };
}

/**
 * Iterate actors whose `data_raw` is non-null + non-empty + parseable JSON,
 * normalize each, write back when changed. Returns a summary suitable for CLI output.
 */
export async function runMigration(
  database: Kysely<DB>,
  _opts: { verbose?: boolean } = {},
): Promise<{
  totalActors: number;
  candidates: number;
  changed: number;
  unchanged: number;
  skipped: number;
  fieldsAdded: Record<string, number>;
  perActor: { actorId: string; status: "changed" | "unchanged" | "skipped"; reason?: string; fieldsAdded?: string[] }[];
}> {
  const rows = await database
    .selectFrom("actors",)
    .select(["id", "data_raw",],)
    .execute();

  let candidates = 0;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  const fieldsAdded: Record<string, number> = {};
  const perActor: {
    actorId: string;
    status: "changed" | "unchanged" | "skipped";
    reason?: string;
    fieldsAdded?: string[];
  }[] = [];

  for (const row of rows) {
    const raw = row.data_raw;
    if (!raw || raw.trim() === "") {
      skipped++;
      perActor.push({ actorId: row.id, status: "skipped", reason: "data_raw empty", },);
      continue;
    }
    const parsedResult = safeJsonParse(raw,);
    if (!parsedResult.ok) {
      skipped++;
      perActor.push({ actorId: row.id, status: "skipped", reason: "data_raw not JSON (yaml/toml?)", },);
      continue;
    }
    const parsed: unknown = parsedResult.value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed,)) {
      skipped++;
      perActor.push({ actorId: row.id, status: "skipped", reason: "data_raw is not a JSON object", },);
      continue;
    }
    candidates++;

    const step = migrateCanonicalExtensions(parsed as Record<string, unknown>,);
    if (!step.changed || !step.next) {
      unchanged++;
      perActor.push({ actorId: row.id, status: "unchanged", },);
      continue;
    }

    // Re-serialize and write back. Idempotent: a second run sees step.changed
    // flip back to false (target_type already present), so this branch always
    // writes a changed payload when reached.
    const stringifyResult = safeJsonStringify(step.next,);
    if (!stringifyResult.ok) {
      skipped++;
      perActor.push({ actorId: row.id, status: "skipped", reason: "data_raw could not be serialized", },);
      continue;
    }
    const nextRaw = stringifyResult.value;
    await database
      .updateTable("actors",)
      .set({ data_raw: nextRaw, },)
      .where("id", "=", row.id,)
      .execute();

    for (const f of step.fieldsAdded) {
      fieldsAdded[f] = (fieldsAdded[f] ?? 0) + 1;
    }
    changed++;
    perActor.push({ actorId: row.id, status: "changed", fieldsAdded: step.fieldsAdded, },);
  }

  return {
    totalActors: rows.length,
    candidates,
    changed,
    unchanged,
    skipped,
    fieldsAdded,
    perActor,
  };
}

/**
 * CLI entry: open the configured DB and run the migration.
 * Exits 0 on success (changed + skipped is normal); exits 1 on DB error.
 */
export async function main(): Promise<number> {
  const config = loadConfig();
  const sqliteFilename = config.db.sqliteFilename;
  if (!sqliteFilename || sqliteFilename === ":memory:") {
    console.error("migrate:character:legacy requires a real on-disk DB; got:", sqliteFilename,);
    return 1;
  }
  const sqlite = new Database(sqliteFilename,);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  const summary = await runMigration(db,);

  console.log("--- migrate:character:legacy summary ---",);
  console.log(`total actors : ${summary.totalActors}`,);
  console.log(`candidates   : ${summary.candidates}`,);
  console.log(`changed      : ${summary.changed}`,);
  console.log(`unchanged    : ${summary.unchanged}`,);
  console.log(`skipped      : ${summary.skipped}`,);
  if (Object.keys(summary.fieldsAdded,).length > 0) {
    console.log("fields added:",);
    for (const [field, count,] of Object.entries(summary.fieldsAdded,)) {
      console.log(`  ${field}: ${count}`,);
    }
  }
  return 0;
}

// CLI guard: only run main when executed directly (not when imported).
if (import.meta.main) {
  // Initialize a console-only logger so config-template expansion can call
  // getLogger() without a host process pre-seeding it. The unit tests
  // already call createLogger() in beforeAll; the guard only fires when
  // bun runs this file as the program entry, so this is safe.
  const { createLogger, } = await import("../logger");
  createLogger({ level: "info", },);
  // If main() throws, let bun's unhandled-rejection handler print the
  // stack trace and exit non-zero — same observable behavior as a typed
  // handler, with fewer lines to cover and less ceremony to maintain.
  await main().then(
    (code,) => process.exit(code,),
  );
}
