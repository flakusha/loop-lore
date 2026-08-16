// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import {
  EmotionDefinitionCreateBody,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

const OptionalString = t.Optional(t.String(),);

const EmotionDefinitionListResponse = ListResponse(t.Object({
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

        if (!isAdminRole(ctx.userRole as string | null,)) {
          return jsonError({ message: "Admin access required", status: HttpStatus.Forbidden, },);
        }

        const { name, displayName, category, valence, arousal, icon, } = ctx.body;

        const id = crypto.randomUUID();
        await database
          .insertInto("emotions",)
          .values({
            id,
            name,
            display_name: displayName,
            category,
            valence,
            arousal,
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
