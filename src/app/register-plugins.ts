// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin registration for the Elysia app.
 *
 * Only infra/HTML modules that are deliberately NEVER versioned mount here:
 * `health` (unversioned `/api` probe prefix — the deploy checklist requires
 * `curl -fsS .../api/health` to answer `200`, never a 308; pinned by
 * `v1-enforcement.test.ts`), `liveness`, `metrics`, `federation`,
 * `build-id`, `views` (server-rendered `/views/*`). `liveness`, `metrics`,
 * `federation`, `build-id` and `views` take no prefix parameter. The v1
 * barrel (`src/routes/v1/base-surface.ts`) mounts the same health factory
 * with an explicit `/api/v1` so `/api/v1/health` stays available.
 *
 * Every versioned JSON module — including the five former `migrated-v1`
 * standalones (`agency`, `location-explorer`, `game-state`,
 * `story-orchestration`, `config-menu`) — mounts ONLY from the v1 barrel
 * (`src/routes/v1/standalone-surface.ts`), which owns the `/api/v1` prefix
 * and the governance guard. Nothing versioned mounts here; `memory-audit`
 * stays nested inside `actorMemoriesRoutes` (never a top-level mount — it
 * would duplicate every `/api/v1` memory-audit route).
 * See `docs/spec/api-versioning.md`.
 */
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { buildIdRoutes, } from "../routes/build-id";
import { federationRoutes, } from "../routes/federation";
import { healthRoutes, } from "../routes/health";
import { livenessRoutes, } from "../routes/liveness";
import { metricsRoutes, } from "../routes/metrics";
import { viewRoutes, } from "../routes/views";

/** */
export interface RegisterPluginsOpts {
  database: Db;
  config: Config;
  /** Async request-result store (request_results table writer). */
  asyncStore: import("../async/store").AsyncStore;
  /**
   * v1 governance-guard enable predicate. Defaults to the E2E_SAFEGUARD env
   * read; injected by tests so they need not mutate `process.env` process-wide.
   */
  governanceEnabled?: () => boolean;
}

/** Minimal structural host: registerPlugins only mounts route-plugin instances. */
type PluginHost = {
  use: (plugin: Parameters<Elysia<any>["use"]>[0],) => unknown;
};

/**
 * Register every route module onto the app in the canonical order.
 * Order matters: Elysia resolves routes by path shape, and later registrations
 * can shadow earlier ones — keep this sequence stable. Mutates `app` in place.
 * @param app
 * @param opts
 * @returns {void}
 */
export function registerPlugins(app: PluginHost, opts: RegisterPluginsOpts,): void {
  const { database, config, asyncStore, } = opts;
  const handleOpts = { database, config, asyncStore, };
  // ── Public routes (auth runs but won't block) ───────────────────────────────
  // Explicit unversioned probe prefix: the `/api` default is load-bearing (see
  // the header comment), so pin it here rather than relying on the default.
  app.use(healthRoutes(handleOpts, "/api",),);
  app.use(livenessRoutes({ database: handleOpts.database, config, },),);
  app.use(metricsRoutes({ config, },),);
  app.use(federationRoutes({ config, database, },),);
  app.use(buildIdRoutes(),);

  // views stays UNGUARDED: server-rendered HTML under /views/*, deliberately
  // unversioned and not a JSON API surface (see the header comment and
  // docs/spec/api-versioning.md).
  app.use(viewRoutes({ database: handleOpts.database, },),);
}
