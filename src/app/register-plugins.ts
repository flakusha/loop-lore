// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Plugin registration for the Elysia app.
 *
 * Registers ONLY the route modules that stay unversioned. Every other module is
 * mounted by the v1 barrel (`src/routes/v1/index.ts` -> the per-section
 * surfaces) under `/api/v1`, so mounting it here as well would serve the same
 * path unversioned and defeat the 308 version redirect enforced by
 * `versionResolver`. See `docs/spec/api-versioning.md`.
 */
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import type { Elysia, } from "elysia";
import { agencyRoutes, } from "../routes/agency";
import { buildIdRoutes, } from "../routes/build-id";
import { configMenuRoutes, } from "../routes/config-menu";
import { federationRoutes, } from "../routes/federation";
import { gameStateRoutes, } from "../routes/game-state";
import { healthRoutes, } from "../routes/health";
import { livenessRoutes, } from "../routes/liveness";
import { locationExplorerRoutes, } from "../routes/location-explorer";
import { memoryAuditRoutes, } from "../routes/memory-audit";
import { metricsRoutes, } from "../routes/metrics";
import { storyOrchestrationRoutes, } from "../routes/story-orchestration";
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

/**
 * Register every route module onto the app in the canonical order.
 * Order matters: Elysia resolves routes by path shape, and later registrations
 * can shadow earlier ones — keep this sequence stable. Mutates `app` in place.
 * @param app
 * @param opts
 * @returns {void}
 */
export function registerPlugins(app: Elysia<any>, opts: RegisterPluginsOpts,): void {
  const { database, config, asyncStore, } = opts;
  const handleOpts = { database, config, asyncStore, };
  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(healthRoutes(handleOpts,),);
  app.use(livenessRoutes({ database: handleOpts.database, config, },),);
  app.use(metricsRoutes({ config, },),);
  app.use(federationRoutes({ config, database, },),);
  app.use(buildIdRoutes(),);

  // ── Migrated route modules ───────────────────────────────────────────────────
  app.use(agencyRoutes({ database: handleOpts.database, },),);
  app.use(memoryAuditRoutes({ database: handleOpts.database, },),);
  app.use(locationExplorerRoutes(handleOpts,),);
  app.use(locationExplorerRoutes(handleOpts, "/api/v1",),);
  app.use(gameStateRoutes(handleOpts, "/api/v1",),);
  app.use(storyOrchestrationRoutes(handleOpts,),);
  app.use(viewRoutes({ database: handleOpts.database, },),);
  app.use(configMenuRoutes({ database: handleOpts.database, },),);
}
