/**
 * Chat Invite Routes
 *
 *   POST   /api/chats/:id/invites            — create an invite (owner/admin)
 *   GET    /api/chats/:id/invites            — list a chat's invites (owner/admin)
 *   DELETE /api/chats/:id/invites/:inviteId  — revoke an invite (owner/admin)
 *   POST   /api/invites/:code/join           — join a chat by redeeming a code (any authed user)
 *
 * Join mechanics: redeeming a code adds the authenticated user's actor to the
 * chat as a participant (role "member"), granting access via checkChatAccess.
 * If the chat is encrypted (standard), encryption keys are distributed to the
 * new participant (mirroring the existing POST /api/chats/:id/participants flow).
 *
 * See .plan/tickets/invite-code-generation.md and .plan/tickets/join-flow-mechanics.md.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  createInvite,
  listInvites,
  redeemInvite,
  revokeInvite,
} from "../chat/invites";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import {
  ErrorResponse,
  InviteChatParams,
  InviteCreateBody,
  InviteJoinParams,
  InviteParams,
  InviteSchema,
  SuccessResponse,
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

function log(): Logger {
  return getLogger().child({ module: "invites", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
}

/** True if the user owns the chat or is an admin. */
async function isChatOwner(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return Boolean(chat,) && (chat!.created_by === userId || userRole === "admin");
}

export function invitesRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "invites", },)
      // ── Create ─────────────────────────────────────────────
      .post(
        prefix + "/chats/:id/invites",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const chatId = (ctx.params as { id: string }).id;

          if (!(await isChatOwner(database, chatId, userId, userRole,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { expiresAt?: string | null; maxUses?: number | null };
          const result = await createInvite(database, {
            chatId,
            createdBy: userId,
            expiresAt: body.expiresAt ?? null,
            maxUses: body.maxUses ?? null,
          },);
          if (!result.ok) {
            return jsonError({ message: result.error.message, status: HttpStatus.BadRequest, },);
          }
          log().info("Created chat invite", { chatId, inviteId: result.value.id, },);
          return jsonCreated(result.value,);
        },
        {
          params: InviteChatParams,
          body: InviteCreateBody,
          response: { 201: InviteSchema, 401: ErrorResponse, 404: ErrorResponse, },
        },
      )
      // ── List ───────────────────────────────────────────────
      .get(
        prefix + "/chats/:id/invites",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const chatId = (ctx.params as { id: string }).id;

          if (!(await isChatOwner(database, chatId, userId, userRole,))) {
            return notFound("Chat not found",);
          }

          const invites = await listInvites(database, chatId,);
          return jsonResponse({ data: invites, },);
        },
        { params: InviteChatParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
      )
      // ── Revoke ─────────────────────────────────────────────
      .delete(
        prefix + "/chats/:id/invites/:inviteId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id: chatId, inviteId, } = ctx.params as { id: string; inviteId: string };

          if (!(await isChatOwner(database, chatId, userId, userRole,))) {
            return notFound("Chat not found",);
          }

          const result = await revokeInvite(database, chatId, inviteId,);
          if (!result.ok) {
            return jsonError({ message: result.error.message, status: HttpStatus.NotFound, },);
          }
          log().info("Revoked chat invite", { chatId, inviteId, },);
          return jsonNoContent();
        },
        { params: InviteParams, response: { 204: t.Void(), 401: ErrorResponse, 404: ErrorResponse, }, },
      )
      // ── Join ───────────────────────────────────────────────
      .post(
        prefix + "/invites/:code/join",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const code = (ctx.params as { code: string }).code;

          const outcome = await redeemInvite(database, { code, actorId: userId, },);
          if (!outcome.ok) {
            const status = outcome.error.code === "not_found" || outcome.error.code === "revoked"
              ? HttpStatus.NotFound
              : (outcome.error.code === "expired" || outcome.error.code === "used_up"
                ? HttpStatus.Gone
                : HttpStatus.BadRequest);
            return jsonError({ message: outcome.error.message, status, },);
          }

          // Distribute encryption keys if the chat is encrypted (non-fatal).
          const chat = await database
            .selectFrom("chats",)
            .select("encryption_level",)
            .where("id", "=", outcome.chatId,)
            .executeTakeFirst();
          if (chat?.encryption_level === "standard") {
            try {
              const { distributeKeysOnJoin, } = await import("../crypto/key-distribution");
              await distributeKeysOnJoin(database, outcome.chatId, userId,);
            } catch (keyError) {
              log().warn("Failed to distribute keys on invite join (non-fatal)", {
                chatId: outcome.chatId,
                participantId: userId,
                error: String(keyError,),
              },);
            }
          }

          log().info("User joined chat via invite", {
            chatId: outcome.chatId,
            userId,
            alreadyMember: outcome.alreadyMember,
          },);
          return jsonResponse({ chatId: outcome.chatId, alreadyMember: outcome.alreadyMember, },);
        },
        {
          params: InviteJoinParams,
          response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, 410: ErrorResponse, },
        },
      )
  );
}
