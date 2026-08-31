// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { archivingRoutes, } from "./archiving";
import { createRoutes, } from "./create";
import { readRoutes, } from "./read";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Message route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`messages`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 * @param opts
 */
export function messagesRoutes(opts: HandlerOpts,) {
  return new Elysia({ name: "messages", },)
    .use(readRoutes(opts,),)
    .use(updateRoutes(opts,),)
    .use(createRoutes(opts,),)
    .use(archivingRoutes(opts,),);
}
