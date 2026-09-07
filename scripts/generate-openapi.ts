// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generate the versioned OpenAPI document.
 *
 * Boots the v1 barrel on a migrated in-memory database, requests
 * `GET /api/v1/openapi/json` via `app.handle` (no listener), and writes
 * the result to `docs/reference/openapi.json` (gitignored — build artifact,
 * regenerate with `bun run openapi`).
 *
 * Barrel-only boot: skips auth/CSRF/daemon wiring in `createApp`, which the
 * spec endpoint never touches.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../src/test-utils/create-test-db";
import type { AsyncStore, } from "../src/async/store";
import type { Config, } from "../src/config";
import type { DB, } from "../src/db/schema";
import { v1Routes, } from "../src/routes/v1/index";

const OUT_PATH = new URL("../docs/reference/openapi.json", import.meta.url,);

/** Minimal async store — the spec endpoint never touches it. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {}, progress() {}, complete() {}, fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {}, async read() { return null; }, destroy() {},
  };
}

const { db, } = await createTestDb() as unknown as { db: Kysely<DB> };
try {
  const app = new Elysia()
    .derive(() => ({ userId: null, userRole: null, sessionId: null, locale: "en", t: (k: string,) => k, }),)
    .use(v1Routes({ database: db, config: {} as Config, asyncStore: stubAsyncStore(), },),);
  const response = await app.handle(new Request("http://localhost/api/v1/openapi/json",),);
  if (!response.ok) {
    throw new Error(`spec endpoint returned ${response.status}`,);
  }
  const spec = await response.json();
  await Bun.write(OUT_PATH, `${JSON.stringify(spec, null, 2)}\n`,);
  const paths = Object.keys(spec.paths ?? {},).length;
  console.log(`wrote docs/reference/openapi.json (${paths} paths)`,);
} finally {
  await db.destroy();
}
