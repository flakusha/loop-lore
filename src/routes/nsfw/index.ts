// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { bodyRoutes, } from "./body";
import { encounterRoutes, } from "./encounters";
import { fantasyRoutes, } from "./fantasies";
import { intimacyRoutes, } from "./intimacy";
import { locationRoutes, } from "./location";
import { seductionRoutes, } from "./seduction";
import type { HandlerOpts, } from "./types";

/**
 * NSFW route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`nsfw`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 * @param opts
 */
export function nsfwRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "nsfw", },)
      .use(intimacyRoutes(opts,),)
      .use(seductionRoutes(opts,),)
      .use(bodyRoutes(opts,),)
      .use(encounterRoutes(opts,),)
      .use(fantasyRoutes(opts,),)
      .use(locationRoutes(opts,),)
  );
}
