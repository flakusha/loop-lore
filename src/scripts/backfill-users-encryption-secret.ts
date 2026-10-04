// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/scripts/backfill-users-encryption-secret.ts
//
// TASK-019: give every pre-existing `users` row a per-user blind-index key
// so the `token` search tier (src/search/providers/messages.ts) can derive
// query tokens against `message_search_tokens`.
//
// Idempotent by construction: only rows whose `encryption_secret` is NULL or
// empty are written, so a second run updates nothing. Rotating a key would
// silently orphan every token already indexed under the old one, so an
// already-keyed user is never touched. `--dry-run` reports the same counts
// without writing.

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { flag, object, runScript, withDefault, } from "../cli/parser";
import { loadConfig, } from "../config/load";
import { generateEncryptionSecret, } from "../crypto/user-secret";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";

/** Counts describing one backfill pass. */
export interface BackfillSummary {
  /** Users with no usable key before the pass. */
  missing: number;
  /** Rows written this pass (0 on a no-op or dry run). */
  updated: number;
  /** True when no write was attempted. */
  dryRun: boolean;
}

/**
 * Backfill `users.encryption_secret` for every user that lacks one.
 *
 * @param db - typed Kysely instance
 * @param opts - `dryRun` reports counts without writing
 * @returns counts of rows considered and written
 * @example
 * ```ts
 * const first = await runBackfill(db, {});
 * const second = await runBackfill(db, {}); // second.updated === 0
 * ```
 */
export async function runBackfill(
  db: Kysely<DB>,
  opts: { dryRun?: boolean } = {},
): Promise<BackfillSummary> {
  const missing = await db
    .selectFrom("users",)
    .select("id",)
    .where((eb,) => eb.or([eb("encryption_secret", "is", null,), eb("encryption_secret", "=", "",),],))
    .execute();

  let updated = 0;
  for (const row of missing) {
    const secret = generateEncryptionSecret();
    if (opts.dryRun !== true) {
      await db.updateTable("users",).set({ encryption_secret: secret, },).where("id", "=", row.id,).execute();
    }
    updated++;
  }

  return { missing: missing.length, updated, dryRun: opts.dryRun === true, };
}

/**
 * CLI entry: open the configured DB and backfill the missing secrets.
 * @returns 0 on success, 1 when the configured DB is not an on-disk file.
 */
export async function main(): Promise<number> {
  const parser = object({ dryRun: withDefault(flag("--dry-run",), false,), },);
  const args = runScript(parser, {
    programName: "backfill:users:encryption-secret",
    brief: "Give existing users a per-user blind-index key (TASK-019).",
    help: "option",
  },);

  const config = loadConfig();
  const sqliteFilename = config.db.sqliteFilename;
  if (!sqliteFilename || sqliteFilename === ":memory:") {
    console.error("backfill:users:encryption-secret requires a real on-disk DB; got:", sqliteFilename,);
    return 1;
  }
  const sqlite = new Database(sqliteFilename,);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  const summary = await runBackfill(db, { dryRun: args.dryRun, },);
  console.log("--- backfill:users:encryption-secret summary ---",);
  console.log(`missing keys : ${summary.missing}`,);
  console.log(`${summary.dryRun ? "would update" : "updated"} : ${summary.updated}`,);
  return 0;
}

// CLI guard: only run main when executed directly (not when imported).
if (import.meta.main) {
  // Console-only logger so config-template expansion can call getLogger()
  // without a host process pre-seeding it.
  const { createLogger, } = await import("../logger");
  createLogger({ level: "info", },);
  await main().then((code,) => process.exit(code,));
}
