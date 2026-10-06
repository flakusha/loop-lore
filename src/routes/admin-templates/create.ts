// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BUILTIN_PROFILES, type ImageModelProfile, } from "../../generation/prompt-templates";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  withPermissionAuth,
} from "../http-utils";
import { loadStoredTemplates, log, mergeProfiles, saveStoredTemplates, } from "./shared";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { templates: { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function createRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-create", },)
      // ── Create custom profile ─────────────────────────────
      .post(
        `${prefix}/admin/templates`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.settings", async () => {
            const body = ctx.body as {
              id: string;
              name: string;
              families: string[];
              promptFormat?: string;
              maxTokenHint?: number;
              defaults?: {
                cfgScale: number;
                steps: number;
                sampler: string;
                scheduler?: string;
              };
            };

            if (!body.id || !body.name || !body.families?.length) {
              return jsonError({
                message: "id, name, and families are required",
                status: HttpStatus.BadRequest,
              },);
            }

            // Validate ID format
            if (!/^[a-z0-9_-]+$/.test(body.id,)) {
              return jsonError({
                message: "Profile ID must be lowercase alphanumeric with hyphens/underscores",
                status: HttpStatus.BadRequest,
              },);
            }

            const stored = await loadStoredTemplates(database,);
            const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);

            if (merged[body.id]) {
              return jsonError({
                message: `Profile '${body.id}' already exists`,
                status: HttpStatus.UnprocessableEntity,
              },);
            }

            const newProfile: ImageModelProfile = {
              id: body.id,
              name: body.name,
              families: body.families as any,
              promptFormat: (body.promptFormat ?? "tags") as any,
              maxTokenHint: body.maxTokenHint ?? 150,
              defaults: {
                cfgScale: body.defaults?.cfgScale ?? 7,
                steps: body.defaults?.steps ?? 28,
                sampler: body.defaults?.sampler ?? "euler_a",
                scheduler: body.defaults?.scheduler ?? "karras",
              },
              templates: {
                instant: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
                balanced: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
                detailed: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
              },
            };

            stored.profiles[body.id] = newProfile;
            await saveStoredTemplates(database, stored,);

            log().info(`Custom profile created: ${body.id}`,);
            return jsonResponse({ ok: true, profileId: body.id, },);
          },);
        },
      )
  );
}
