// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import { createSqliteDialect, } from "../db/index";
import { up, } from "../db/migrations/001_init";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { safeFetch, } from "../utils";

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
  // eslint-disable-next-line @typescript-eslint/require-await -- app options type requires Promise<Response>
  handleNonApiRequest: async () => new Response("Not found", { status: 404, },),
},);
console.log("createApp succeeded",);

const server = Bun.serve({ port: 0, fetch: app.fetch, },);
console.log("Bun.serve started on port", server.port,);
const result = await safeFetch(`http://localhost:${server.port}/api/health`,);
console.log("Health check:", result.ok ? result.status : result.error.message,);
server.stop();
console.log("Server stopped",);
process.exit(0,);
