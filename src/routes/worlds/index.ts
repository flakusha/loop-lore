// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { autonomyRoutes, } from "./autonomy-routes";
import { chatsRoutes, } from "./chats";
import { fractalLocationsRoutes, } from "./fractal-locations-routes";
import { fractalTravelRoutes, } from "./fractal-travel-routes";
import { locationRoutes, } from "./locations-routes";
import { timelinesRoutes, } from "./timelines";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";
/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { worlds: { get: { body: unknown; params: {}; query: unknown; headers: unknown; response: { ...; }; }; }; }; } & ... ...}
 */
export function worldsRoutes(opts: HandleOpts, prefix = "/api",) {
  return new Elysia({ name: "worlds", },)
    .use(worldRoutes(opts, prefix,),)
    .use(locationRoutes(opts, prefix,),)
    .use(chatsRoutes(opts, prefix,),)
    .use(timelinesRoutes(opts, prefix,),)
    .use(autonomyRoutes(opts, prefix,),)
    .use(fractalLocationsRoutes(opts, prefix,),)
    .use(fractalTravelRoutes(opts, prefix,),);
}
