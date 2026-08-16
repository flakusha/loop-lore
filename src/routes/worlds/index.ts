// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { chatsRoutes, } from "./chats";
import { locationRoutes, } from "./locations-routes";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

/**
 * World route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`worlds`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function worldsRoutes(opts: HandleOpts,) {
  return new Elysia({ name: "worlds", },)
    .use(worldRoutes(opts,),)
    .use(locationRoutes(opts,),)
    .use(chatsRoutes(opts,),);
}
