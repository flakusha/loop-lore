/**
 * Character Avatars Routes
 *
 * API endpoints for managing character avatars with context-aware selection.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AvatarService, } from "../characters/services/avatar-service";
import type { DB, } from "../db/schema";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/** Check if user owns the actor (or is admin/solo) */
async function checkActorOwnership(
  database: Kysely<DB>,
  actorId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const actor = await database
    .selectFrom("actors",)
    .select("owner_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return false; }
  return actor.owner_id === userId || userRole === "admin" || userRole === "solo";
}

export function characterAvatarsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return new Elysia({ name: "character-avatars", },)
    .get("/api/actors/:actorId/avatars", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const avatars = await avatarService.getAvatars(actorId,);
      return jsonResponse(avatars,);
    },)
    .get("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const avatar = await avatarService.getAvatar(avatarId,);
      if (!avatar) { return jsonError({ message: "Avatar not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(avatar,);
    },)
    .post("/api/actors/:actorId/avatars", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
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
    },)
    .put("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
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
    },)
    .delete("/api/actors/:actorId/avatars/:avatarId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const { avatarId, } = ctx.params as { avatarId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      await avatarService.deleteAvatar(avatarId,);
      return jsonNoContent();
    },)
    .post("/api/actors/:actorId/avatars/select", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
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
    },)
    .get("/api/actors/:actorId/avatars/config", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const config = await avatarService.getAvatarConfig(actorId,);
      return jsonResponse(config,);
    },)
    .put("/api/actors/:actorId/avatars/config", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
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
    },)
    .get("/api/worlds/:worldId/avatars/config/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { worldId, actorId, } = ctx.params as { worldId: string; actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const config = await avatarService.getWorldAvatarConfig(actorId, worldId,);
      return jsonResponse(config,);
    },)
    .put("/api/worlds/:worldId/avatars/config/:actorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { worldId, actorId, } = ctx.params as { worldId: string; actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const selectionRuleOverride = body.selectionRuleOverride as string | undefined;
      const weightsOverride = body.weightsOverride as Record<string, number> | undefined;

      await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
        selectionRuleOverride: selectionRuleOverride as any,
        weightsOverride,
      },);
      return jsonResponse({ ok: true, },);
    },);
}
