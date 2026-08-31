// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { configRoutes, } from "./config";
import { crudRoutes, } from "./crud";
import { selectRoutes, } from "./select";
import type { HandlerOpts, } from "./types";

/**
 * Character Avatars Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-avatars`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 * @param opts
 */
export function characterAvatarsRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-avatars", },)
      .use(crudRoutes(opts,),)
      .use(selectRoutes(opts,),)
      .use(configRoutes(opts,),)
  );
}
