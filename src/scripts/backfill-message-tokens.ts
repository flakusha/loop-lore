// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/scripts/backfill-message-tokens.ts
//
// CLI shell for the token backfill (TASK-encrypted-search-minimal-first-slice);
// the streaming logic lives in src/search/token-backfill.ts. Derives blind
// search tokens for every EXISTING server-encrypted message the FTS5 tier
// cannot see (`content_plaintext IS NULL` with a `key_id`), so the `token`
// tier (src/search/providers/messages.ts) can find rows written before
// ENABLE_TOKEN_INDEXING existed.
//
// The SMK comes from the app config — without it candidate rows cannot be
// decrypted and the script exits 1. Rows whose chat tier is `none`, whose
// payload is undecryptable, or whose chat owner has no usable
// `users.encryption_secret` are counted and skipped, never guessed at.
// Idempotent and resumable: pass a previous run's `--after-rowid` cursor back
// to continue a bounded run.

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { flag, integer, object, option, runScript, withDefault, } from "../cli/parser";
import { loadConfig, } from "../config/load";
import { initSmk, } from "../crypto/smk";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { getChildLogger, type Logger, } from "../logger";
import { backfillMessageTokens, } from "../search/token-backfill";

/**
 * Module logger accessor — null until the CLI guard calls `createLogger()`.
 * @returns the child logger, or null when no logger is initialized.
 */
const log = (): Logger | null => getChildLogger("scripts/backfill:messages:search-tokens",);

/**
 * CLI entry: open the configured DB, arm the SMK from config, backfill.
 * @returns 0 on success; 1 for a non-file DB or missing server key.
 */
export async function main(): Promise<number> {
  const args = runScript(
    object({
      dryRun: withDefault(flag("--dry-run",), false,),
      batchSize: withDefault(option("--batch-size", integer({ min: 1, },),), 500,),
      maxBatches: withDefault(option("--batches", integer({ min: 0, },),), 0,),
      afterRowid: withDefault(option("--after-rowid", integer({ min: 0, },),), 0,),
    },),
    {
      programName: "backfill:messages:search-tokens",
      brief:
        "Derive blind search tokens for existing server-encrypted messages (TASK-encrypted-search-minimal-first-slice).",
      help: "option",
    },
  );

  const config = loadConfig();
  const sqliteFilename = config.db.sqliteFilename;
  if (!sqliteFilename || sqliteFilename === ":memory:") {
    log()?.error("requires a real on-disk DB; got:", undefined, { sqliteFilename, },);
    return 1;
  }

  const serverKey = config.encryption.serverEncryptionKey;
  if (serverKey === undefined || serverKey === "") {
    log()?.error(
      "no encryption.serverEncryptionKey configured — candidate rows cannot be decrypted",
      undefined,
      undefined,
    );

    return 1;
  }

  await initSmk({
    serverEncryptionKey: serverKey,
    required: false,
    compressThreshold: config.encryption.compressThreshold,
    compressAlgorithm: config.encryption.compressAlgorithm,
  },);

  const sqlite = new Database(sqliteFilename,);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  const summary = await backfillMessageTokens(db, {
    dryRun: args.dryRun,
    batchSize: args.batchSize,
    maxBatches: args.maxBatches,
    afterRowid: args.afterRowid,
  },);

  // Human-facing report block on stdout; the summary is the product of this
  // script and the test suite asserts on it, so it stays a direct write.
  // eslint-disable-next-line no-console
  console.log("--- backfill:messages:search-tokens summary ---",);
  // eslint-disable-next-line no-console
  console.log(`candidates    : ${summary.candidates}`,);
  // eslint-disable-next-line no-console
  console.log(`${summary.dryRun ? "would index" : "indexed"}     : ${summary.indexed}`,);
  // eslint-disable-next-line no-console
  console.log(`skipped       : ${summary.skipped}`,);
  // eslint-disable-next-line no-console
  console.log(`undecryptable : ${summary.undecryptable}`,);
  // eslint-disable-next-line no-console
  console.log(`resume cursor : --after-rowid ${summary.cursor}`,);
  return 0;
}

// CLI guard: only run main when executed directly (not when imported).
if (import.meta.main) {
  // Console-only logger so config-template expansion can call getLogger()
  // without a host process pre-seeding it (mirrors
  // backfill-users-encryption-secret.ts; the static import would pull the
  // logger's config-template machinery ahead of createLogger()).
  const { createLogger, } = await import("../logger");
  createLogger({ level: "info", },);
  await main().then(async (code,) => {
    // The log queue batches on a 100ms timer; drain it before the exit takes
    // the queued diagnostic down with the process. A transport rejection must
    // not skip the exit — `code` is this script's contract.
    await log()?.flush().catch(() => undefined);
    process.exit(code,);
  },);
}
