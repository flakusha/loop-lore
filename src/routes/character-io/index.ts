// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { exportRoutes, } from "./export";
import { importRoutes, } from "./import";
import type { HandlerOpts, } from "./types";

/**
 * Character IO Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-io`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 * @param opts
 */
export function characterIoRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-io", },)
      .use(exportRoutes(opts,),)
      .use(importRoutes(opts,),)
  );
}
