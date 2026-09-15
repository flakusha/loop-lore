// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { aiActionRoutes, } from "./ai-action";
import { archivingRoutes, } from "./archiving";
import { createRoutes, } from "./create";
import { forwardRoutes, } from "./forward";
import { readRoutes, } from "./read";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Message route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`messages`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 * @param opts
 * @param prefix
 */
export function messagesRoutes(opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "messages", },)
    .use(readRoutes(opts, prefix,),)
    .use(updateRoutes(opts, prefix,),)
    .use(createRoutes(opts, prefix,),)
    .use(forwardRoutes(opts, prefix,),)
    .use(aiActionRoutes(opts, prefix,),)
    .use(archivingRoutes(opts, prefix,),);
}
