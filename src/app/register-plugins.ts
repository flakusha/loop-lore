// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Plugin registration for the Elysia app.
 *
 * Registers all route modules via `.use()` in a fixed order (route resolution
 * depends on registration order). Extracted from elysia-app.ts so the app
 * builder stays small; behavior is identical.
 */
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import type { Elysia, } from "elysia";
import { agencyRoutes, } from "../routes/agency";
import { buildIdRoutes, } from "../routes/build-id";
import { configMenuRoutes, } from "../routes/config-menu";
import { federationRoutes, } from "../routes/federation";
import { gameStateRoutes, } from "../routes/game-state";
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
  // ── Intentionally NOT versioned (no /api/v1 mount) ─────────────────────────
  // Infra probes: livenessRoutes, metricsRoutes, buildIdRoutes.
  // Federation/mesh wire protocol (spec-fixed paths): federationRoutes.
  // Intentionally unversioned: agencyRoutes, memoryAuditRoutes, viewRoutes.
  // gameStateRoutes: already mounted at /api/v1 inline.
  const { database, config, asyncStore, } = opts;
  const handleOpts = { database, config, asyncStore, };
  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(livenessRoutes({ database: handleOpts.database, config, },),);
  app.use(metricsRoutes({ config, },),);
  app.use(federationRoutes({ config, database, },),);
  app.use(buildIdRoutes(),);

  // ── Auth protected routes ───────────────────────────────────────────────────

  // ── Migrated route modules ───────────────────────────────────────────────────
  app.use(agencyRoutes({ database: handleOpts.database, },),);
  app.use(memoryAuditRoutes({ database: handleOpts.database, },),);
  app.use(gameStateRoutes(handleOpts, "/api/v1",),);
  app.use(locationExplorerRoutes(handleOpts, "/api/v1",),);
  app.use(storyOrchestrationRoutes(handleOpts,),);
  app.use(viewRoutes({ database: handleOpts.database, },),);
  app.use(configMenuRoutes({ database: handleOpts.database, },),);

  // ── Blog system ──────────────────────────────────────────────────────────

  // ── Bulk import/export (ZIP) ─────────────────────────────────────────────
}
