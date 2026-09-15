// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { assignRoutes, } from "./assign";
import { bulkAssignRoutes, } from "./bulk";
import { createRoutes, } from "./create";
import { listRoutes, } from "./list";
import { narrativeRoutes, } from "./narrative";
import { removeRoutes, } from "./remove";
import { reorderRoutes, } from "./reorder";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Chat sections facade — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`chat-sections`) is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 * @param opts
 * @param prefix
 */
export function chatSectionsRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "chat-sections", },)
      .use(listRoutes(opts, prefix,),)
      .use(createRoutes(opts, prefix,),)
      .use(updateRoutes(opts, prefix,),)
      .use(removeRoutes(opts, prefix,),)
      .use(reorderRoutes(opts, prefix,),)
      .use(assignRoutes(opts, prefix,),)
      .use(bulkAssignRoutes(opts, prefix,),)
      .use(narrativeRoutes(opts, prefix,),)
  );
}
