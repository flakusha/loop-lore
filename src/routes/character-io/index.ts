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
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function characterIoRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "character-io", },)
      .use(exportRoutes(opts, prefix,),)
      .use(importRoutes(opts, prefix,),)
  );
}
