/**
 * Character Avatars Routes
 *
 * API endpoints for managing character avatars with context-aware selection.
 */
import { Elysia, t, } from "elysia";
import { AvatarService, } from "../characters/services/avatar-service";
import {
  ActorIdAvatarIdParams,
  ActorIdAvatarParams,
  AvatarConfigBody,
  AvatarCreateBody,
  AvatarResponse,
  AvatarSelectBody,
  AvatarUpdateBody,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
  WorldActorParams,
  WorldAvatarConfigBody,
} from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterAvatarsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return new Elysia({ name: "character-avatars", },)
    .get("/api/actors/:actorId/avatars", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const avatars = await avatarService.getAvatars(actorId,);
      return jsonResponse(avatars,);
    }, {
      params: ActorIdAvatarParams,
      response: {
        200: ListResponse(AvatarResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List actor avatars",
        description: "List all avatars for a given actor.",
        tags: ["Avatars",],
      },
    },)
    .get("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, avatarId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const avatar = await avatarService.getAvatar(avatarId,);
      if (!avatar) {
        return jsonError({
          message: ctx.t?.("characters.avatarNotFound",) ?? "Avatar not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(avatar,);
    }, {
      params: ActorIdAvatarIdParams,
      response: {
        200: AvatarResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get actor avatar",
        description: "Get a specific avatar by ID for a given actor.",
        tags: ["Avatars",],
      },
    },)
    .post("/api/actors/:actorId/avatars", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { assetId, label, tags, isPrimary, sortOrder, } = ctx.body;

      const avatarId = await avatarService.createAvatar({
        actorId,
        assetId,
        label: label ?? "",
        tags: tags ?? {},
        isPrimary: isPrimary ?? false,
        sortOrder: sortOrder ?? 0,
      },);
      return jsonCreated({ id: avatarId, },);
    }, {
      params: ActorIdAvatarParams,
      body: AvatarCreateBody,
      response: {
        200: AvatarResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create actor avatar",
        description: "Create a new avatar for an actor. Requires an assetId.",
        tags: ["Avatars",],
      },
    },)
    .put("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, avatarId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { label, tags, isPrimary, sortOrder, } = ctx.body;

      await avatarService.updateAvatar(avatarId, {
        label,
        tags,
        isPrimary,
        sortOrder,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      params: ActorIdAvatarIdParams,
      body: AvatarUpdateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update actor avatar",
        description: "Update an existing avatar's label, tags, primary flag, or sort order.",
        tags: ["Avatars",],
      },
    },)
    .delete("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, avatarId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      await avatarService.deleteAvatar(avatarId,);
      return jsonNoContent();
    }, {
      params: ActorIdAvatarIdParams,
      detail: {
        summary: "Delete actor avatar",
        description: "Delete an avatar by ID.",
        tags: ["Avatars",],
      },
    },)
    .post("/api/actors/:actorId/avatars/select", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

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
      detail: {
        summary: "Select context-aware avatar",
        description:
          "Select the best avatar for an actor based on context (emotion, mood, action, location, time, outfit).",
        tags: ["Avatars",],
      },
    },)
    .get("/api/actors/:actorId/avatars/config", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const config = await avatarService.getAvatarConfig(actorId,);
      return jsonResponse(config,);
    }, {
      params: ActorIdAvatarParams,
      detail: {
        summary: "Get avatar selection config",
        description: "Get the avatar selection configuration for an actor.",
        tags: ["Avatars",],
      },
    },)
    .put("/api/actors/:actorId/avatars/config", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { selectionRule, weights, fallbackChain, } = ctx.body;

      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule,
        weights,
        fallbackChain,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      params: ActorIdAvatarParams,
      body: AvatarConfigBody,
      detail: {
        summary: "Update avatar selection config",
        description: "Update the avatar selection configuration (rule, weights, fallback chain) for an actor.",
        tags: ["Avatars",],
      },
    },)
    .get("/api/worlds/:worldId/avatars/config/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { worldId, actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const config = await avatarService.getWorldAvatarConfig(actorId, worldId,);
      return jsonResponse(config,);
    }, {
      params: WorldActorParams,
      detail: {
        summary: "Get world avatar config",
        description: "Get the world-specific avatar configuration override for an actor.",
        tags: ["Avatars",],
      },
    },)
    .put("/api/worlds/:worldId/avatars/config/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { worldId, actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { selectionRuleOverride, weightsOverride, } = ctx.body;

      await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
        selectionRuleOverride,
        weightsOverride,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      params: WorldActorParams,
      body: WorldAvatarConfigBody,
      detail: {
        summary: "Update world avatar config",
        description: "Update the world-specific avatar configuration override for an actor.",
        tags: ["Avatars",],
      },
    },);
}
