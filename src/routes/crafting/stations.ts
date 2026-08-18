// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Station Routes — barrel
 *
 * Mounts both station-definition and station-instance CRUD sub-plugins.
 * See `station-defs.ts` and `station-instances.ts` for route details.
 */
import { Elysia, } from "elysia";
import type { Db, } from "../../db";
import { craftingStationDefsRoutes, } from "./station-defs";
import { craftingStationInstancesRoutes, } from "./station-instances";

/**
 * Mount all crafting station routes (definitions + instances).
 *
 * Signature kept stable so `register-plugins.ts` and tests need no changes.
 */
export function craftingStationRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  return new Elysia({ name: "crafting-stations", },)
    .use(craftingStationDefsRoutes({ database, }, prefix,),)
    .use(craftingStationInstancesRoutes({ database, }, prefix,),);
}
