// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Traits Routes
 *
 * Bundles permanent (Layer 0), world (Layer 2), and location (Layer 3)
 * trait route modules under a single plugin name.
 */
import { Elysia, } from "elysia";
import { type HandlerOpts, } from "./actor-auth";
import { locationTraitRoutes, } from "./character-traits/location";
import { permanentTraitRoutes, } from "./character-traits/permanent";
import { worldTraitRoutes, } from "./character-traits/world";

export function characterTraitsRoutes(opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "character-traits", },)
    .use(permanentTraitRoutes(opts, prefix,),)
    .use(worldTraitRoutes(opts, prefix,),)
    .use(locationTraitRoutes(opts, prefix,),);
}
