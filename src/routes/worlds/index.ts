// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { chatsRoutes, } from "./chats";
import { locationRoutes, } from "./locations-routes";
import { timelinesRoutes, } from "./timelines";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";
export function worldsRoutes(opts: HandleOpts,) {
  return new Elysia({ name: "worlds", },)
    .use(worldRoutes(opts,),)
    .use(locationRoutes(opts,),)
    .use(chatsRoutes(opts,),)
    .use(timelinesRoutes(opts,),);
}
