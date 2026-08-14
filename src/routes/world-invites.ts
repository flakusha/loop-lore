/**
 * World Invite Routes
 *
 * Create, list, revoke, and redeem world invite codes. Redeeming a world
 * invite joins the user to the world (inserts a `world_members` row),
 * granting access to unlisted/private worlds. Creating/list/revoking is
 * owner-or-admin; joining requires only authentication.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  createWorldInvite,
  listWorldInvites,
  redeemWorldInvite,
  revokeWorldInvite,
} from "../chat/world-invites";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import {
  ErrorResponse,
  Id,
  InviteCreateBody,
  InviteJoinParams,
  SuccessResponse,
  WorldInviteParams,
  WorldInviteSchema,
} from "../validation/schemas";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

function log(): Logger {
  return getLogger().child({ module: "world-invites", },);
}

/** True if the user owns the world or is an admin. */
async function isWorldOwner(
  database: Kysely<DB>,
  worldId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const world = await database
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  return Boolean(world,) && (world!.owner_id === userId || userRole === "admin" || userRole === "solo");
}

export function worldInvitesRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "world-invites", },)
      // ── Create ─────────────────────────────────────────────
      .post(
        `${prefix}/worlds/:worldId/invites`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { worldId, } = ctx.params as { worldId: string };

          if (!(await isWorldOwner(database, worldId, userId, userRole,))) {
            return notFound("World not found",);
          }

          const body = ctx.body as { expiresAt?: string | null; maxUses?: number | null };
          const result = await createWorldInvite(database, {
            worldId,
            createdBy: userId,
            expiresAt: body.expiresAt ?? null,
            maxUses: body.maxUses ?? null,
          },);
          if (!result.ok) {
            return jsonError({ message: result.error.message, status: HttpStatus.BadRequest, },);
          }
          log().info("Created world invite", { worldId, inviteId: result.value.id, },);
          return jsonCreated(result.value,);
        },
        {
          params: t.Object({ worldId: Id, },),
          body: InviteCreateBody,
          response: { 201: WorldInviteSchema, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        },
      )
      // ── List ───────────────────────────────────────────────
      .get(
        `${prefix}/worlds/:worldId/invites`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { worldId, } = ctx.params as { worldId: string };

          if (!(await isWorldOwner(database, worldId, userId, userRole,))) {
            return notFound("World not found",);
          }

          const invites = await listWorldInvites(database, worldId,);
          return jsonResponse({ data: invites, },);
        },
        {
          params: t.Object({ worldId: Id, },),
          response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
        },
      )
      // ── Revoke ─────────────────────────────────────────────
      .delete(
        `${prefix}/worlds/:worldId/invites/:inviteId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { worldId, inviteId, } = ctx.params as { worldId: string; inviteId: string };

          if (!(await isWorldOwner(database, worldId, userId, userRole,))) {
            return notFound("World not found",);
          }

          const result = await revokeWorldInvite(database, worldId, inviteId,);
          if (!result.ok) {
            return jsonError({ message: result.error.message, status: HttpStatus.NotFound, },);
          }
          log().info("Revoked world invite", { worldId, inviteId, },);
          return jsonNoContent();
        },
        {
          params: WorldInviteParams,
          response: { 204: t.Void(), 401: ErrorResponse, 404: ErrorResponse, },
        },
      )
      // ── Join ───────────────────────────────────────────────
      .post(
        `${prefix}/world-invites/:code/join`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { code, } = ctx.params as { code: string };

          const outcome = await redeemWorldInvite(database, { code, actorId: userId, },);
          if (!outcome.ok) {
            const status = outcome.error.code === "not_found" || outcome.error.code === "revoked"
              ? HttpStatus.NotFound
              : (outcome.error.code === "expired" || outcome.error.code === "used_up"
                ? HttpStatus.Gone
                : HttpStatus.BadRequest);
            return jsonError({ message: outcome.error.message, status, },);
          }

          log().info("User joined world via invite", {
            worldId: outcome.worldId,
            userId,
            alreadyMember: outcome.alreadyMember,
          },);
          return jsonResponse({ worldId: outcome.worldId, alreadyMember: outcome.alreadyMember, },);
        },
        {
          params: InviteJoinParams,
          response: {
            200: SuccessResponse,
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
            410: ErrorResponse,
          },
        },
      )
  );
}
