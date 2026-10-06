// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BUILTIN_PROFILES, } from "../../generation/prompt-templates";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  withPermissionAuth,
} from "../http-utils";
import { loadStoredTemplates, log, saveStoredTemplates, } from "./shared";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { templates: { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function removeRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-remove", },)
      // ── Delete custom profile ─────────────────────────────
      .delete(
        `${prefix}/admin/templates/:id`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.settings", async () => {
            const { id, } = ctx.params as { id: string };

            if (id in BUILTIN_PROFILES) {
              return jsonError({
                message: "Cannot delete builtin profiles",
                status: HttpStatus.BadRequest,
              },);
            }

            const stored = await loadStoredTemplates(database,);

            if (!stored.profiles[id]) {
              return jsonError({ message: "Profile not found", status: HttpStatus.NotFound, },);
            }

            const { [id]: _, ...rest } = stored.profiles;
            stored.profiles = rest;
            await saveStoredTemplates(database, stored,);

            log().info(`Custom profile deleted: ${id}`,);
            return jsonResponse({ ok: true, },);
          },);
        },
      )
  );
}
