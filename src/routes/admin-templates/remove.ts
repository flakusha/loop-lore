import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BUILTIN_PROFILES, } from "../../generation/prompt-templates";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { loadStoredTemplates, log, saveStoredTemplates, } from "./shared";

export function removeRoutes(opts: { database: Kysely<DB> }, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-remove", },)
      // ── Delete custom profile ─────────────────────────────
      .delete(
        prefix + "/admin/templates/:id",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

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
        },
      )
  );
}
