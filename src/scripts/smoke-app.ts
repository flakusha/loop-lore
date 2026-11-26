// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { tmpdir, } from "node:os";
import { loadConfig, } from "../config/load";
import { createSqliteDialect, } from "../db/index";
import { getMigrationFiles, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { createLogger, getChildLogger, type Logger, } from "../logger";
import { safeFetch, } from "../utils";

/** Apply the consolidated 14-file baseline to this one-shot DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

// Console-only logger: a one-shot smoke run has no host process to seed one.
createLogger({ level: "info", },);

const sqlite = new Database(":memory:",);
sqlite.run("PRAGMA foreign_keys = ON",);
const dialect = createSqliteDialect(sqlite,);
const db = new Kysely<DB>({ dialect, },);
await applyBaseline(db as unknown as Kysely<unknown>,);

const config = loadConfig();
config.db.sqliteFilename = ":memory:";
config.auth.required = false;
config.assets.uploadDir = tmpdir();

const app = createApp({
  database: db,
  config,

  handleNonApiRequest: async () => new Response("Not found", { status: 404, },),
  handleApiRequest: async () => new Response("Not found", { status: 404, },),
},);

log()?.info("createApp succeeded",);

const server = Bun.serve({ port: 0, fetch: app.fetch, },);
log()?.info("Bun.serve started on port", { port: server.port, },);
const result = await safeFetch(`http://localhost:${server.port}/api/health`,);
if (!result.ok) {
  log()?.error("Health check failed", result.error,);
} else {
  log()?.info("Health check", { detail: result.status, },);
}

server.stop();
log()?.info("Server stopped",);
// The log queue batches on a 100ms timer; drain it before either exit. A failed
// probe must fail the gate — this script is a gate, not a best-effort probe.
await log()?.flush().catch(() => undefined);
process.exit(result.ok ? 0 : 1,);

/**
 * Module logger accessor — null if no logger is initialized.
 * @returns the child logger, or null when no logger is initialized.
 */
function log(): Logger | null {
  return getChildLogger("scripts/smoke-app",);
}
