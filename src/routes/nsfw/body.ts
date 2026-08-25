// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { BodySystemService, } from "../../rpg/body-systems/service";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, requireActorAccess, } from "./shared";
import type { HandlerOpts, } from "./types";

/**
 * Allowed fields on PUT /api/nsfw/body/:actorId.
 *
 * BUG-nsfw-body-profile-mass-assignment: the schema is declared on the
 * Elysia route (line 81). Elysia validates the body against this shape
 * before the handler runs, so a body containing `actorId`, `id`, or any
 * other internal field is rejected at the HTTP boundary. The downstream
 * service (`BodySystemService.updateProfile`) also picks fields by name
 * rather than spreading the input — defense in depth.
 */
const bodyUpdateSchema = t.Object({
  stamina: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  flexibility: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  sensitivity: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  endurance: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  sizeCategory: t.Optional(t.Union([
    t.Literal("petite",),
    t.Literal("small",),
    t.Literal("average",),
    t.Literal("large",),
    t.Literal("massive",),
  ],),),
  build: t.Optional(t.Union([
    t.Literal("slim",),
    t.Literal("athletic",),
    t.Literal("average",),
    t.Literal("curvy",),
    t.Literal("muscular",),
    t.Literal("heavy",),
  ],),),
  beauty: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  charisma: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  style: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
  scent: t.Optional(t.Union([t.String({ maxLength: 200, },), t.Null(),],),),
},);

export function bodyRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const bodyService = new BodySystemService(database,);

  return (
    new Elysia({ name: "nsfw-body", },)
      .get(
        `${prefix}/nsfw/body/:actorId`,
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          try {
            const profile = await bodyService.getProfile(ctx.params.actorId,);
            return jsonResponse(profile,);
          } catch (error) {
            log().error("Failed to get body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        `${prefix}/nsfw/body/:actorId`,
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          try {
            // bodyUpdateSchema whitelists the allowed fields above. Elysia will
            // reject any unrecognised key with a 422 before this handler runs.
            const success = await bodyService.updateProfile(
              ctx.params.actorId,
              ctx.body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        { body: bodyUpdateSchema, },
      )
  );
}
