// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { actorRoutes, } from "./actor";
import { definitionRoutes, } from "./definitions";
import type { HandlerOpts, } from "./types";

/**
 * Character Emotions Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-emotions`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 * @param opts
 */
export function characterEmotionsRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-emotions", },)
      .use(actorRoutes(opts,),)
      .use(definitionRoutes(opts,),)
  );
}
