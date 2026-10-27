// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin registration for the Elysia app.
 *
 * Two groups are registered here:
 * - Infra/HTML modules that are deliberately NEVER versioned: `health`,
 *   `liveness`, `metrics`, `federation`, `build-id`, `views` (server-rendered
 *   `/views/*`). `liveness`, `metrics`, `federation`, `build-id` and `views`
 *   take no prefix parameter. `health` takes one and is mounted here with the
 *   unversioned `/api` probe prefix: the deploy checklist requires
 *   `curl -fsS .../api/health` to answer `200` (a 308 fails it) and
 *   `v1-enforcement.test.ts` pins that unversioned infra surfaces answer
 *   directly. The v1 barrel (`src/routes/v1/base-surface.ts`) mounts the same
 *   factory with an explicit `/api/v1` so `/api/v1/health` stays available.
 * - Migrated JSON modules (`agency`, `memory-audit`, `location-explorer`,
 *   `game-state`, `story-orchestration`, `config-menu`) whose factory defaults
 *   to `prefix = "/api/v1"`. Register each EXACTLY ONCE with the default -
 *   passing the prefix explicitly (or mounting a second time) duplicates the
 *   same routes and defeats the 308 version redirect enforced by
 *   `versionResolver`. They are NOT part of the v1 barrel
 *   (`src/routes/v1/index.ts`), which mounts the per-section surfaces instead.
 * See `docs/spec/api-versioning.md`.
 */
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { agencyRoutes, } from "../routes/agency";
import { buildIdRoutes, } from "../routes/build-id";
import { configMenuRoutes, } from "../routes/config-menu";
import { federationRoutes, } from "../routes/federation";
import { gameStateRoutes, } from "../routes/game-state";
import { healthRoutes, } from "../routes/health";
import { livenessRoutes, } from "../routes/liveness";
import { locationExplorerRoutes, } from "../routes/location-explorer";
import { metricsRoutes, } from "../routes/metrics";
import { storyOrchestrationRoutes, } from "../routes/story-orchestration";
import { governanceGuard, } from "../routes/v1/governance";
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

  // ── Migrated route modules ───────────────────────────────────────────────────
  // These mounts sit OUTSIDE the v1 barrel, so before the guarded instance
  // below the governance guard never ran on them (S-6): story LLM endpoints
  // were unlimited and config-menu writes carried no rate limit. One guarded
  // Elysia instance carries them all — the guard's hooks apply to every
  // plugin registered on it after the guard, the same arrangement as the v1
  // barrel (src/routes/v1/index.ts). The enable predicate mirrors the barrel
  // default; injected via RegisterPluginsOpts for tests.
  const govEnabled = opts.governanceEnabled ?? (() => process.env.E2E_SAFEGUARD !== "1");
  const migrated = new Elysia({ name: "migrated-v1", },)
    .use(governanceGuard({ enabled: govEnabled, },),)
    .use(agencyRoutes({ database: handleOpts.database, },),)
    // memory-audit is NOT mounted here: `actorMemoriesRoutes` nests it inside the
    // v1 actors surface (`src/routes/v1/actors-surface.ts` -> actor-memories.ts:173),
    // so a mount here would duplicate every /api/v1 memory-audit route.
    .use(locationExplorerRoutes(handleOpts,),)
    .use(gameStateRoutes(handleOpts,),)
    .use(storyOrchestrationRoutes(handleOpts,),)
    .use(configMenuRoutes({ database: handleOpts.database, },),);

  app.use(migrated,);
  // views stays UNGUARDED: server-rendered HTML under /views/*, deliberately
  // unversioned and not a JSON API surface (see the header comment and
  // docs/spec/api-versioning.md).
  app.use(viewRoutes({ database: handleOpts.database, },),);
}
