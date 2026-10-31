// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 standaloneSurface barrel — the five route modules that used to mount
 * from `src/app/register-plugins.ts` as a guarded `migrated-v1` instance
 * outside the v1 barrel.
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
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { agencyRoutes, } from "../agency";
import { configMenuRoutes, } from "../config-menu";
import { gameStateRoutes, } from "../game-state";
import { locationExplorerRoutes, } from "../location-explorer";
import { storyOrchestrationRoutes, } from "../story-orchestration";

/**
 * @param opts
 * @returns Elysia plugin carrying the five standalone v1 modules.
 */
export function standaloneSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  return new Elysia({ name: "v1-standalone", },)
    .use(agencyRoutes({ database: handleOpts.database, }, prefix,),)
    .use(locationExplorerRoutes(handleOpts, prefix,),)
    .use(gameStateRoutes(handleOpts, prefix,),)
    .use(storyOrchestrationRoutes(handleOpts, prefix,),)
    .use(configMenuRoutes({ database: handleOpts.database, }, prefix,),);
}
