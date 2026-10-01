// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit override routes: chat/scene override (top rung of the context
 * ladder) and location→outfit rules (middle rung).
 *
 * Authz: chat routes require chat access + actor ownership; world routes
 * require world write access + actor ownership (default-deny).
 */
import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../chat/service/access";
import {
  requestOutfitChange,
  OutfitChangeInitiator,
  type OutfitChangeGate,
} from "../characters/services/wardrobe/change-gate";
import {
  setLocationOutfitBindings,
  setChatOutfitOverride,
} from "../characters/services/wardrobe/overrides";
import {
  ChatOutfitOverrideBody,
  ErrorResponse,
  LocationOutfitBindingsBody,
  SuccessResponse,
  WardrobeChatParams,
  WorldActorParams,
} from "../validation/schemas";
import { checkActorOwnership, } from "./actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";
import { requireWorldAccess, } from "./worlds/access";
import type { HandlerOpts } from "./actor-auth";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":chatId": { ...; }; }; }; } & ... 2 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function outfitOverrideRoutes(opts: HandlerOpts & { outfitChangeGate?: OutfitChangeGate; }, prefix = "/api",) {
  const { database, outfitChangeGate, } = opts;

  return new Elysia({ name: "outfit-overrides", },)
    // ── Read the chat/scene override ──────────────────────────────

    .get(`${prefix}/chats/:chatId/wardrobe-override/:actorId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { chatId, actorId, } = ctx.params;
      const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
      if (!access.ok) {
        return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
      }
      if (!(await requireActorAccessOwnership(ctx, database, actorId,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const row = await database
        .selectFrom("chat_wardrobe_overrides",)
        .select(["outfit_id", "updated_at",],)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();
      return jsonResponse({ outfit_id: row?.outfit_id ?? null, updated_at: row?.updated_at ?? null, },);
    }, {
      params: t.Object({ chatId: t.String(), actorId: t.String(), },),
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get chat outfit override",
        description: "Read the current chat/scene outfit override for one actor.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Set / clear the chat/scene override ───────────────────────

    .put(`${prefix}/chats/:chatId/wardrobe-override`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { chatId, } = ctx.params;
      const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
      if (!access.ok) {
        return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
      }
      const { actor_id: actorId, outfit_id: outfitId, } = ctx.body;
      if (!(await requireActorAccessOwnership(ctx, database, actorId,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      // Immersion-gate routing (TASK-wardrobe-story-gm-integration): a
      // wardrobe change of the PLAYER actor is reviewed; NPC and world-rule
      // changes bypass the gate entirely (deterministic world state).
      const targetActor = await database
        .selectFrom("actors",)
        .select(["actor_type",],)
        .where("id", "=", actorId,)
        .executeTakeFirst();
      const initiator = targetActor?.actor_type === "user"
        ? OutfitChangeInitiator.Player
        : OutfitChangeInitiator.Npc;
      const currentOverride = await database
        .selectFrom("chat_wardrobe_overrides",)
        .select(["outfit_id",],)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();
      const verdict = await requestOutfitChange({
        actorId,
        chatId,
        fromOutfitId: currentOverride?.outfit_id ?? null,
        toOutfitId: outfitId,
        initiator,
      }, outfitChangeGate,);
      if (!verdict.allowed) {
        return jsonError({
          message: verdict.reason ?? "Outfit change refused",
          status: HttpStatus.Forbidden,
        },);
      }

      try {
        await setChatOutfitOverride(database, {
          chatId,
          actorId,
          outfitId,
          changedBy: userId,
        },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Outfit not found";
        return jsonError({ message, status: HttpStatus.NotFound, },);
      }
      return jsonResponse({ ok: true, },);
    }, {
      params: WardrobeChatParams,
      body: ChatOutfitOverrideBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Set chat outfit override",
        description: "Set (or clear with null) the chat/scene outfit override for one actor.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Location → outfit rules ───────────────────────────────────

    .put(`${prefix}/worlds/:worldId/actors/:actorId/outfit-bindings`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { worldId, actorId, } = ctx.params;
      const worldErr = await requireWorldAccess(database, worldId, userId, ctx.userRole as string | null,);
      if (worldErr) { return worldErr; }
      if (!(await requireActorAccessOwnership(ctx, database, actorId,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      try {
        await setLocationOutfitBindings(database, {
          worldId,
          actorId,
          bindings: ctx.body.bindings,
        },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Outfit not visible";
        return jsonError({ message, status: HttpStatus.NotFound, },);
      }
      return jsonResponse({ ok: true, },);
    }, {
      params: WorldActorParams,
      body: LocationOutfitBindingsBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Set location outfit rules",
        description: "Replace the location→outfit rule map for one actor in one world.",
        tags: ["Wardrobe",],
      },
    },);
}

/**
 * Actor-ownership check for routes where the actor id arrives in the body
 * (chat override) rather than the path.
 * @param ctx
 * @param database
 * @param actorId
 * @returns void
 */
async function requireActorAccessOwnership(
  ctx: { userRole?: string | null },
  database: Parameters<typeof checkActorOwnership>[0],
  actorId: string,
): Promise<boolean> {
  const userId = requireUserId(ctx as never,);
  if (typeof userId !== "string") { return false; }
  return checkActorOwnership(database, actorId, userId, ctx.userRole ?? null,);
}
