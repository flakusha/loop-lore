// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { bulkTraitsRoutes, } from "./bulk";
import { locationTraitRoutes, } from "./location";
import { permanentTraitRoutes, } from "./permanent";
import type { HandlerOpts, } from "./types";
import { worldTraitRoutes, } from "./world";

/**
 * Character Traits Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-traits`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 */
export function characterTraitsRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-traits", },)
      .use(permanentTraitRoutes(opts,),)
      .use(worldTraitRoutes(opts,),)
      .use(locationTraitRoutes(opts,),)
      .use(bulkTraitsRoutes(opts,),)
  );
}
