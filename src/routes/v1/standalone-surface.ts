// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 standaloneSurface barrel — the route modules that used to mount
 * from `src/app/register-plugins.ts` as a guarded `migrated-v1` instance
 * outside the v1 barrel, plus the loop-lore-facade REST surface (agents call
 * the facade op registry over HTTP; mounts here so the v1 auth/governance
 * chain wraps it like every other /api/v1 route).
 *
 * They already default to `prefix = "/api/v1"`; this surface is the single
 * owner that passes that prefix explicitly, so every module answers exactly
 * one versioned path. Mounting any of them a second time (here AND in
 * register-plugins) would duplicate the routes and defeat the 308 version
 * redirect enforced by `versionResolver` — hence the EXACTLY-ONCE rule now
 * lives here instead of in a `register-plugins.ts` comment.
 *
 * `memory-audit` stays nested inside `actorMemoriesRoutes` (actors-surface)
 * rather than mounting here — a mount here would duplicate every
 * `/api/v1` memory-audit route.
 */
import { Elysia, } from "elysia";
import { agentApiRoutes, } from "../../agent/api/router";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { featuresForOpts, } from "../../features/surface";
import { createMcpRoutes, } from "../../integrations/loop-lore-facade/mcp/routes";
import { createFacadeRoutes, } from "../../integrations/loop-lore-facade/routes";
import { createMcpHttpRoutes, } from "../../integrations/mcp/http-server";
import { agencyRoutes, } from "../agency";
import { configMenuRoutes, } from "../config-menu";
import { gameStateRoutes, } from "../game-state";
import { locationExplorerRoutes, } from "../location-explorer";
import { omniSearchRoutes, } from "../omni-search";
import { storyOrchestrationRoutes, } from "../story-orchestration";
import { capabilityManifestRoutes, } from "./capabilities";
/**
 * @param opts
 * @returns Elysia plugin carrying the standalone v1 modules + the facade
 * REST surface.
 */
export function standaloneSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  const features = featuresForOpts(opts,);
  const app = new Elysia({ name: "v1-standalone", },);
  if (!features.chat && !features.harness) { return app; }
  app.use(
    new Elysia({ name: "v1-standalone-routes", },)
      // ── RSI agent API (agent-api-router ticket) ────────────────
      // Mounted IN the v1 barrel (single mount): the surface authenticates via
      // scoped agent_tokens (requireAgentScope in the route guards — 401/403/
      // 429 in the guard), not the session chain; /api/agent/* is allowlisted
      // in require-auth-guard for the same reason. Sub-route tickets (#6/#7/#8)
      // hang their routes off this plugin.
      .use(agentApiRoutes({ database, }, prefix,),)
      .use(agencyRoutes({ database: handleOpts.database, }, prefix,),)
      .use(locationExplorerRoutes(handleOpts, prefix,),)
      .use(gameStateRoutes(handleOpts, prefix,),)
      .use(storyOrchestrationRoutes(handleOpts, prefix,),)
      .use(configMenuRoutes({ database: handleOpts.database, }, prefix,),)
      .use(omniSearchRoutes({ database: handleOpts.database, }, prefix,),)
      .use(createFacadeRoutes(handleOpts, prefix,),)
      .use(createMcpRoutes(handleOpts, prefix,),)
      .use(createMcpHttpRoutes(handleOpts, { prefix, },),)
      .use(capabilityManifestRoutes(handleOpts, prefix,),),
  );

  return app;
}
