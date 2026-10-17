// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import type { HandleOpts, } from "./types";
import { Elysia, } from "elysia";
import { anomalyRoutes, } from "./anomaly-routes";
import { autonomyRoutes, } from "./autonomy-routes";
import { chatsRoutes, } from "./chats";
import { encounterRoutes, } from "./encounter-routes";
import { factionRoutes, } from "./faction-routes";
import { fractalLocationsRoutes, } from "./fractal-locations-routes";
import { fractalTravelRoutes, } from "./fractal-travel-routes";
import { karmaRoutes, } from "./karma-routes";
import { locationEdgeRoutes, } from "./location-edges";
import { locationRoutes, } from "./locations-routes";
import { mapRoutes, } from "./map-routes";
import { mapZoneRoutes, } from "./map-zone-routes";
import { resourceRoutes, } from "./resource-routes";
import { storageRoutes, } from "./storage-routes";
import { timelinesRoutes, } from "./timelines";
import { travelStatusRoutes, } from "./travel-status";
import { worldConditionsRoutes, } from "./world-conditions-routes";
import { worldLicenseRoutes, } from "./world-license-routes";
import { worldRoutes, } from "./worlds-routes";
import { worldStreamRoutes, } from "./world-stream";
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
    .use(fractalTravelRoutes(opts, prefix,),)
    .use(worldStreamRoutes(opts, prefix,),)
    .use(travelStatusRoutes(opts, prefix,),)
    .use(locationEdgeRoutes(opts, prefix,),)
    .use(anomalyRoutes(opts, prefix,),)
    .use(encounterRoutes(opts, prefix,),)
    .use(factionRoutes(opts, prefix,),)
    .use(karmaRoutes(opts, prefix,),)
    .use(resourceRoutes(opts, prefix,),)
    .use(storageRoutes(opts, prefix,),)
    .use(worldConditionsRoutes(opts, prefix,),)
    .use(worldLicenseRoutes(opts, prefix,),)
    .use(mapRoutes(opts, prefix,),)
    .use(mapZoneRoutes(opts, prefix,),);
}
