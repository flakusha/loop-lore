// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import {
  EmotionDefinitionCreateBody,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

const OptionalString = t.Optional(t.String(),);

export const EmotionDefinitionListResponse = ListResponse(t.Object({
  id: t.String(),
  name: t.String(),
  displayName: OptionalString,
  category: t.String(),
  valence: t.Number(),
  arousal: t.Number(),
  icon: OptionalString,
},),);

/**
 * Emotion definitions sub-plugin — list/create global emotion definitions.
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { emotions: { get: { ...; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
export function definitionRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "character-emotions-definitions", },)
      // ── List all emotion definitions ───────────────────────────
      .get(`${prefix}/emotions`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const emotions = await database
          .selectFrom("emotions",)
          .selectAll()
          .execute();

        return jsonResponse(emotions,);
      }, {
        response: {
          200: EmotionDefinitionListResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "List emotion definitions",
          description: "List all available emotion definitions (name, valence, arousal, etc).",
          tags: ["Character Emotions",],
        },
      },)
      // ── Create a new emotion definition ────────────────────────
      .post(`${prefix}/emotions`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        if (!can(ctx.userRole as string | null, "admin.settings",)) {
          return jsonError({ message: "Admin access required", status: HttpStatus.Forbidden, },);
        }

        const { name, displayName, category, valence, arousal, icon, } = ctx.body;

        // `EmotionDefinitionCreateBody` declares only `name` (plus two unused
        // optionals), so Elysia strips displayName/category/valence/arousal out
        // of `ctx.body` — passing them through unchanged made every POST fail
        // with NOT NULL on `emotions.display_name`. The columns are NOT NULL in
        // the schema, so each needs a default that matches what the row needs.
        const id = crypto.randomUUID();
        await database
          .insertInto("emotions",)
          .values({
            id,
            name,
            display_name: displayName ?? name,
            category: category ?? "neutral",
            valence: valence ?? 0,
            arousal: arousal ?? 0,
            icon: icon ?? null,
            created_at: new Date().toISOString(),
          },)
          .execute();

        return jsonCreated({ id, },);
      }, {
        body: EmotionDefinitionCreateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "Create emotion definition",
          description: "Create a new emotion definition with name, category, valence, and arousal.",
          tags: ["Character Emotions",],
        },
      },)
  );
}
