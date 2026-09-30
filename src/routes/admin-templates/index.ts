// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createRoutes, } from "./create";
import { listRoutes, } from "./list";
import { removeRoutes, } from "./remove";
import { updateRoutes, } from "./update";

/**
 * Admin Template Management facade — barrel assembling the HTTP surface from
 * domain sub-plugins. Registration point/name (`admin-templates`) is preserved
 * so the `register-plugins.ts` wiring is unchanged.
 *
 *   GET    /api/admin/templates             — list all profiles
 *   GET    /api/admin/templates/:id         — get one profile
 *   GET    /api/admin/templates/registry    — get full registry
 *   PUT    /api/admin/templates/:id         — update template text
 *   PUT    /api/admin/templates/:id/defaults — update model defaults
 *   POST   /api/admin/templates             — create custom profile
 *   DELETE /api/admin/templates/:id         — delete custom profile
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { templates: { ...; }; }; }; } & ... 5 more ... & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function adminTemplateRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-templates", },)
      .use(listRoutes(opts, prefix,),)
      .use(updateRoutes(opts, prefix,),)
      .use(createRoutes(opts, prefix,),)
      .use(removeRoutes(opts, prefix,),)
  );
}
