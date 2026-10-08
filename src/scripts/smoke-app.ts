// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import { createSqliteDialect, } from "../db/index";
import { up, } from "../db/migrations/001_init";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { createLogger, getLogger, type Logger, } from "../logger";
import { safeFetch, } from "../utils";

// Console-only logger: a one-shot smoke run has no host process to seed one.
createLogger({ level: "info", },);

/**
 * Module logger accessor — null if no logger is initialized.
 * @returns the child logger, or null when no logger is initialized.
 */
function log(): Logger | null {
  try {
    return getLogger().child({ module: "scripts/smoke-app", },);
  } catch {
    return null;
  }
}

const sqlite = new Database(":memory:",);
sqlite.run("PRAGMA foreign_keys = ON",);
const dialect = createSqliteDialect(sqlite,);
const db = new Kysely<DB>({ dialect, },);
await up(db as Kysely<unknown>,);

const config = loadConfig();
config.db.sqliteFilename = ":memory:";
config.auth.required = false;
config.assets.uploadDir = "/tmp/";

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
log()?.info("Health check", { detail: result.ok ? result.status : result.error.message, },);
server.stop();
log()?.info("Server stopped",);
// The log queue batches on a 100ms timer; drain it before the exit. A transport
// rejection must not skip `process.exit(0)` — exit 0 is this script's contract.
await log()?.flush().catch(() => undefined);
process.exit(0,);
