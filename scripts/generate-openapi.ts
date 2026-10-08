// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generate the versioned OpenAPI document.
 *
 * Boots the served route surface on a migrated in-memory database, requests
 * `GET /api/v1/openapi/json` via `app.handle` (no listener), and writes the
 * result to `docs/reference/openapi.json` (gitignored — build artifact,
 * regenerate with `bun run openapi`).
 *
 * Mounts BOTH halves of the real app — `v1Routes` then `registerPlugins`. That
 * is NOT the order `src/elysia-app.ts` uses (which mounts `registerPlugins`
 * first), but the order does not affect the collected spec: both sequences
 * yield the same 600 paths / 807 operations, since registration order changes
 * no path or operation count. Barrel-only mounting silently omitted
 * every `registerPlugins` route still served under `/api/v1` —
 * `location-explorer` and `game-state` among them — so the spec described a
 * smaller API than the server exposes. `registerPlugins` reads
 * `config.observability.*` at construction, hence the real `loadConfig()`
 * instead of the `{}` cast the barrel-only boot could get away with.
 *
 * Still skips the auth/CSRF/daemon wiring in `createApp`, which the spec
 * endpoint never touches.
 *
 * ponytail: booting `v1Routes` leaves a live handle on the event loop, so the
 * process never exits on its own (observed: SIGTERM at 300s with the spec
 * already written). `db.destroy()` does not clear it and importing the barrel
 * alone is clean, so the handle appears during `.use()`. Explicit exit after
 * the write rather than bisecting the offending plugin; revisit only if the
 * spec ever has to be generated twice in one process.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { registerPlugins, } from "../src/app/register-plugins";
import type { AsyncStore, } from "../src/async/store";
import { loadConfig, } from "../src/config/load";
import type { DB, } from "../src/db/schema";
import { v1Routes, } from "../src/routes/v1/index";
import { createTestDb, } from "../src/test-utils/create-test-db";

const OUT_PATH = new URL("../docs/reference/openapi.json", import.meta.url,);

/** Minimal async store — the spec endpoint never touches it. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },
    destroy() {},
  };
}

const config = loadConfig();
const asyncStore = stubAsyncStore();
const { db, } = await createTestDb() as unknown as { db: Kysely<DB> };
let summary = "";
try {
  const app = new Elysia()
    .derive(() => ({ userId: null, userRole: null, sessionId: null, locale: "en", t: (k: string,) => k, }))
    .use(v1Routes({ database: db, config, asyncStore, },),);
  registerPlugins(app as unknown as Elysia<any>, { database: db, config, asyncStore, },);
  const response = await app.handle(new Request("http://localhost/api/v1/openapi/json",),);
  if (!response.ok) {
    throw new Error(`spec endpoint returned ${response.status}`,);
  }
  const spec = await response.json();
  await Bun.write(OUT_PATH, `${JSON.stringify(spec, null, 2,)}\n`,);
  const paths = Object.keys(spec.paths ?? {},).length;
  summary = `wrote docs/reference/openapi.json (${paths} paths)\n`;
} finally {
  await db.destroy();
}
// `process.stdout.write`, not `console.log`: the explicit exit below drops a
// buffered `console.log` on a piped stdout (observed), which would swallow the
// summary on CI where the gate captures stdout.
process.stdout.write(summary,);
process.exit(0,);
