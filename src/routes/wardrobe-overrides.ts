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
import {
  type OutfitChangeGate,
  OutfitChangeInitiator,
  requestOutfitChange,
} from "../characters/services/wardrobe/change-gate";
import {
  setChatOutfitOverride,
  setLocationOutfitBindings,
} from "../characters/services/wardrobe/overrides";
import { checkChatAccess, } from "../chat/service/access";
import {
  ChatOutfitOverrideBody,
  ErrorResponse,
  LocationOutfitBindingsBody,
  SuccessResponse,
  WardrobeChatParams,
  WorldActorParams,
} from "../validation/schemas";
import { checkActorOwnership, } from "./actor-auth";
import type { HandlerOpts, } from "./actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";
import { requireWorldAccess, } from "./worlds/access";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":chatId": { ...; }; }; }; } & ... 2 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function outfitOverrideRoutes(opts: HandlerOpts & { outfitChangeGate?: OutfitChangeGate }, prefix = "/api",) {
  const { database, outfitChangeGate, } = opts;

  return new Elysia({ name: "outfit-overrides", },)
    // ── Read the chat/scene override ──────────────────────────────

    .get(`${prefix}/chats/:id/wardrobe-override/:actorId`, async (ctx: any,) => {
      const guard = await requireChatActorAccess(ctx, opts,);
      if (guard instanceof Response) { return guard; }
      const { chatId, actorId, } = guard;

      const row = await database
        .selectFrom("chat_wardrobe_overrides",)
        .select(["outfit_id", "updated_at",],)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();
      return jsonResponse({ outfit_id: row?.outfit_id ?? null, updated_at: row?.updated_at ?? null, },);
    }, {
      params: t.Object({ id: t.String(), actorId: t.String(), },),
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

    .put(`${prefix}/chats/:id/wardrobe-override`, async (ctx: any,) => {
      const { outfit_id: outfitId, } = ctx.body;
      const guard = await requireChatActorAccess(ctx, opts, ctx.body.actor_id,);
      if (guard instanceof Response) { return guard; }
      const { chatId, actorId, userId, } = guard;

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

      return await mutationResponse(
        () => setChatOutfitOverride(database, { chatId, actorId, outfitId, changedBy: userId, },),
        "Outfit not found",
      );
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
      const guard = await requireWorldActorAccess(ctx, opts,);
      if (guard instanceof Response) { return guard; }
      const { worldId, actorId, } = guard;

      return await mutationResponse(
        () => setLocationOutfitBindings(database, { worldId, actorId, bindings: ctx.body.bindings, },),
        "Outfit not visible",
      );
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
 * Chat-access + actor-ownership guard for the chat outfit-override routes.
 * @param ctx
 * @param opts
 * @param bodyActorId - actor id from the body when the path omits it
 * @returns the resolved ids, or a Response to short-circuit the handler
 */
async function requireChatActorAccess(
  ctx: { params: { id: string; actorId?: string }; body?: { actor_id?: string }; userRole?: string | null },
  opts: HandlerOpts,
  bodyActorId?: string,
): Promise<Response | { chatId: string; actorId: string; userId: string }> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const actorId = ctx.params.actorId ?? bodyActorId;
  const chatId = ctx.params.id;
  const access = await checkChatAccess(opts.database, chatId, userId, ctx.userRole as string | null,);
  if (!access.ok) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
  }
  if (!(actorId && await checkActorOwnership(opts.database, actorId, userId, ctx.userRole ?? null,))) {
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
  }
  return { chatId, actorId, userId, };
}

/**
 * World-write-access + actor-ownership guard for the location rule route.
 * @param ctx
 * @param opts
 * @returns the resolved ids, or a Response to short-circuit the handler
 */
async function requireWorldActorAccess(
  ctx: { params: { worldId: string; actorId: string }; userRole?: string | null },
  opts: HandlerOpts,
): Promise<Response | { worldId: string; actorId: string }> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const { worldId, actorId, } = ctx.params;
  const worldErr = await requireWorldAccess(opts.database, worldId, userId, ctx.userRole as string | null,);
  if (worldErr) { return worldErr; }
  if (!(await checkActorOwnership(opts.database, actorId, userId, ctx.userRole ?? null,))) {
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
  }
  return { worldId, actorId, };
}

/**
 * Run a wardrobe mutation, mapping a thrown service error to a 404 response.
 * @param run
 * @param fallbackMessage
 * @returns 200 `{ok:true}`, or 404 carrying the service error message
 */
async function mutationResponse(run: () => Promise<void>, fallbackMessage: string,): Promise<Response> {
  try {
    await run();
    return jsonResponse({ ok: true, },);
  } catch (error) {
    const message = error instanceof Error ? error.message : fallbackMessage;
    return jsonError({ message, status: HttpStatus.NotFound, },);
  }
}
