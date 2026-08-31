// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { BUILTIN_PROFILES, type ImageModelProfile, } from "../../generation/prompt-templates";
import { can, } from "../../users/permissions";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { loadStoredTemplates, log, mergeProfiles, saveStoredTemplates, } from "./shared";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 */
export function createRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-create", },)
      // ── Create custom profile ─────────────────────────────
      .post(
        `${prefix}/admin/templates`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          if (!can(ctx.userRole as string | null, "admin.settings",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

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
        },
      )
  );
}
