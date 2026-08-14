import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BUILTIN_PROFILES, type DetailLevel, type SdGenMode, } from "../../generation/prompt-templates";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { loadStoredTemplates, log, mergeProfiles, saveStoredTemplates, } from "./shared";

export function updateRoutes(opts: { database: Kysely<DB> }, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-update", },)
      // ── Update template text for a profile ────────────────
      .put(
        prefix + "/admin/templates/:id",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id, } = ctx.params as { id: string };
          const body = ctx.body as {
            detail?: DetailLevel;
            mode?: SdGenMode;
            template?: string;
          };

          if (!body.detail || !body.mode || !body.template) {
            return jsonError({
              message: "detail, mode, and template are required",
              status: HttpStatus.BadRequest,
            },);
          }

          const stored = await loadStoredTemplates(database,);
          const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
          const existing = merged[id];

          if (!existing) {
            return jsonError({ message: "Profile not found", status: HttpStatus.NotFound, },);
          }

          // Deep clone the profile
          const updated = structuredClone(existing,);

          // Ensure template structure exists
          if (!updated.templates) {
            updated.templates = {} as Record<DetailLevel, any>;
          }
          if (!updated.templates[body.detail]) {
            (updated.templates as any)[body.detail] = {};
          }
          (updated.templates as any)[body.detail][body.mode] = body.template;

          // Store as custom (even for builtin overrides)
          stored.profiles[id] = updated;
          await saveStoredTemplates(database, stored,);

          log().info(`Template updated: ${id}/${body.detail}/${body.mode}`,);
          return jsonResponse({ ok: true, profileId: id, },);
        },
      )
      // ── Update model defaults for a profile ───────────────
      .put(
        prefix + "/admin/templates/:id/defaults",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id, } = ctx.params as { id: string };
          const body = ctx.body as {
            cfgScale?: number;
            steps?: number;
            sampler?: string;
            scheduler?: string;
            clipSkip?: number;
            maxTokenHint?: number;
          };

          const stored = await loadStoredTemplates(database,);
          const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
          const existing = merged[id];

          if (!existing) {
            return jsonError({ message: "Profile not found", status: HttpStatus.NotFound, },);
          }

          const updated = structuredClone(existing,);

          if (body.cfgScale !== undefined) { updated.defaults.cfgScale = body.cfgScale; }
          if (body.steps !== undefined) { updated.defaults.steps = body.steps; }
          if (body.sampler !== undefined) { updated.defaults.sampler = body.sampler; }
          if (body.scheduler !== undefined) { updated.defaults.scheduler = body.scheduler; }
          if (body.clipSkip !== undefined) { updated.defaults.clipSkip = body.clipSkip; }
          if (body.maxTokenHint !== undefined) { updated.maxTokenHint = body.maxTokenHint; }

          stored.profiles[id] = updated;
          await saveStoredTemplates(database, stored,);

          log().info(`Model defaults updated: ${id}`,);
          return jsonResponse({ ok: true, profileId: id, },);
        },
      )
  );
}
