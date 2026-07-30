/**
 * Character Avatars Routes
 *
 * API endpoints for managing character avatars with context-aware selection.
 */
import { Elysia, } from "elysia";
import { AvatarService, } from "../characters/services/avatar-service";
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

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const avatars = await avatarService.getAvatars(actorId,);
      return jsonResponse(avatars,);
    }, {
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

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };

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

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const body = ctx.body as Record<string, unknown>;

      const assetId = body.assetId as string | undefined;
      const label = body.label as string | undefined;
      const tags = body.tags as Record<string, string[]> | undefined;
      const isPrimary = body.isPrimary as boolean | undefined;
      const sortOrder = body.sortOrder as number | undefined;

      if (!assetId) {
        return jsonError({ message: "assetId is required", status: HttpStatus.BadRequest, },);
      }

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

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const label = body.label as string | undefined;
      const tags = body.tags as Record<string, string[]> | undefined;
      const isPrimary = body.isPrimary as boolean | undefined;
      const sortOrder = body.sortOrder as number | undefined;

      await avatarService.updateAvatar(avatarId, {
        label,
        tags,
        isPrimary,
        sortOrder,
      },);
      return jsonResponse({ ok: true, },);
    }, {
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

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      await avatarService.deleteAvatar(avatarId,);
      return jsonNoContent();
    }, {
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

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const body = ctx.body as Record<string, unknown>;

      const emotion = body.emotion as string | undefined;
      const mood = body.mood as string | undefined;
      const action = body.action as string | undefined;
      const location = body.location as string | undefined;
      const time = body.time as string | undefined;
      const outfit = body.outfit as string | undefined;
      const worldId = body.worldId as string | undefined;

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

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const config = await avatarService.getAvatarConfig(actorId,);
      return jsonResponse(config,);
    }, {
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

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const body = ctx.body as Record<string, unknown>;

      const selectionRule = body.selectionRule as string | undefined;
      const weights = body.weights as Record<string, number> | undefined;
      const fallbackChain = body.fallbackChain as string[] | undefined;

      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: selectionRule as any,
        weights,
        fallbackChain: fallbackChain as any,
      },);
      return jsonResponse({ ok: true, },);
    }, {
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

      const { worldId, actorId, } = ctx.params as { worldId: string; actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const config = await avatarService.getWorldAvatarConfig(actorId, worldId,);
      return jsonResponse(config,);
    }, {
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

      const { worldId, actorId, } = ctx.params as { worldId: string; actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const selectionRuleOverride = body.selectionRuleOverride as string | undefined;
      const weightsOverride = body.weightsOverride as Record<string, number> | undefined;

      await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
        selectionRuleOverride: selectionRuleOverride as any,
        weightsOverride,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      detail: {
        summary: "Update world avatar config",
        description: "Update the world-specific avatar configuration override for an actor.",
        tags: ["Avatars",],
      },
    },);
}
