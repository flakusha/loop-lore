import { Elysia, } from "elysia";
import { AvatarService, } from "../../characters/services/avatar-service";
import {
  ActorIdAvatarParams,
  AvatarResponse,
  AvatarSelectBody,
  ErrorResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Avatar selection sub-plugin — context-aware avatar selection.
 */
export function selectRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return (
    new Elysia({ name: "character-avatars-select", },)
      .post("/api/actors/:actorId/avatars/select", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { emotion, mood, action, location, time, outfit, worldId, } = ctx.body;

        const avatar = await avatarService.selectAvatar(actorId, {
          emotion,
          mood,
          action,
          location,
          time,
          outfit,
        }, worldId,);
        if (!avatar) { return jsonError({ message: "No avatar found", status: HttpStatus.NotFound, },); }
        return jsonResponse(avatar,);
      }, {
        params: ActorIdAvatarParams,
        body: AvatarSelectBody,
        response: {
          200: AvatarResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Select context-aware avatar",
          description:
            "Select the best avatar for an actor based on context (emotion, mood, action, location, time, outfit).",
          tags: ["Avatars",],
        },
      },)
  );
}
