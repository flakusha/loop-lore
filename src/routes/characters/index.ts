// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { cardRoutes, } from "./card";
import { createRoutes, } from "./create";
import { exportRoutes, } from "./export";
import { listRoutes, } from "./list";
import { readRoutes, } from "./read";
import { removeRoutes, } from "./remove";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Characters route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`characters`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 * @param opts
 * @param prefix
 */
export function charactersRoutes(opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "characters", },)
    .use(listRoutes(opts, prefix,),)
    .use(createRoutes(opts, prefix,),)
    .use(readRoutes(opts, prefix,),)
    .use(cardRoutes(opts, prefix,),)
    .use(updateRoutes(opts, prefix,),)
    .use(removeRoutes(opts, prefix,),)
    .use(exportRoutes(opts, prefix,),);
}
