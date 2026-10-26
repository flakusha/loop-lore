// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Orchestration Routes
 *
 * Wires the story-engine surface into the HTTP API per
 * docs/frontend/chat/multi-llm-story.md § API Endpoints:
 *
 *   GET  /api/chats/:id/story/state      — turn state snapshot
 *   POST /api/chats/:id/story/pause      — pause generation
 *   POST /api/chats/:id/story/resume     — resume generation
 *   POST /api/chats/:id/story/step       — execute a single GM turn
 *   POST /api/chats/:id/story/configure  — strategy/maxTurns/thresholds
 *   POST /api/chats/:id/story/narration  — inject a narration beat
 *   POST /api/chats/:id/gm/escalate      — escalate the latest open turn
 */
import { Elysia, t, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { TurnStrategy, } from "../../db/enums";
import { TurnStatus, } from "../../db/enums-story/turns";
import { safeJsonStringify, } from "../../utils";
import { forbiddenResponse, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { createGm, latestOpenTurn, loadChat, notFound, parseGmConfig, } from "./helpers";

/** Body accepted by POST /story/step. */
const StepBody = t.Object({ forceActorId: t.Optional(t.String(),), },);
/** Body accepted by POST /story/narration. */
const NarrationBody = t.Object({ text: t.String({ minLength: 1, },), },);
/** Body accepted by POST /story/configure. */
const ConfigureBody = t.Object({
  turnStrategy: t.Optional(t.Enum(TurnStrategy,),),
  maxTurns: t.Optional(t.Integer({ minimum: 1, },),),
  qualityThresholds: t.Optional(t.Record(t.String(), t.Number(),),),
},);

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 * @returns the story-orchestration Elysia plugin
 */
export function storyOrchestrationRoutes(
  opts: { database: Db; config: Config },
  prefix = "/api/v1",
): Elysia {
  const db = opts.database;

  return new Elysia({ name: "story-orchestration", },)
    .get(
      `${prefix}/chats/:id/story/state`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        const gm = createGm(db, opts.config, params.id, chat.gm_config, chat.created_by,);
        await gm.initialize();
        return jsonResponse({
          chatId: params.id,
          currentTurn: gm.currentTurn,
          isPaused: gm.isPaused,
          isComplete: gm.isComplete,
        },);
      },
    )
    .post(
      `${prefix}/chats/:id/story/pause`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        const gm = createGm(db, opts.config, params.id, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.pause();
        return jsonResponse({ ok: true, isPaused: true, },);
      },
    )
    .post(
      `${prefix}/chats/:id/story/resume`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        const gm = createGm(db, opts.config, params.id, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.resume();
        return jsonResponse({ ok: true, isPaused: false, },);
      },
    )
    .post(
      `${prefix}/chats/:id/story/step`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, body, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }

        if (body.forceActorId) {
          const participant = await db.selectFrom("chat_participants",)
            .select("actor_id",)
            .where("chat_id", "=", params.id,)
            .where("actor_id", "=", body.forceActorId,)
            .executeTakeFirst();

          if (!participant) {
            return forbiddenResponse("Actor is not a participant in this chat",);
          }
        }

        const gm = createGm(db, opts.config, params.id, chat.gm_config, chat.created_by,);
        await gm.initialize();
        const result = await gm.executeTurn(body.forceActorId,);
        return jsonResponse({
          turnId: result.turnId,
          actorId: result.actorId ?? null,
          decision: result.gmDecision,
          response: result.response ?? null,
        },);
      },
      { body: StepBody, },
    )
    .post(
      `${prefix}/chats/:id/story/configure`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, body, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        const merged = parseGmConfig(chat.gm_config,);
        if (body.qualityThresholds) {
          merged.qualityThresholds = { ...merged.qualityThresholds, ...body.qualityThresholds, };
        }

        const serialized = safeJsonStringify(merged,);
        if (!serialized.ok) {
          return jsonError({ message: "gm_config serialization failed", status: HttpStatus.InternalServerError, },);
        }

        await db
          .updateTable("chats",)
          .set({
            turn_strategy: body.turnStrategy ?? null,
            max_turns: body.maxTurns ?? null,
            gm_config: serialized.value,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", params.id,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      { body: ConfigureBody, },
    )
    .post(
      `${prefix}/chats/:id/story/narration`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, body, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        if (!chat.world_id) {
          return jsonError({
            message: "Chat has no world — narration requires a world context",
            status: HttpStatus.BadRequest,
          },);
        }

        const gm = createGm(db, opts.config, params.id, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.injectNarration(chat.world_id, body.text,);
        return jsonResponse({ ok: true, },);
      },
      { body: NarrationBody, },
    )
    .post(
      `${prefix}/chats/:id/gm/escalate`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, } = ctx;
        const chat = await loadChat(db, params.id,);
        if (!chat) { return notFound(); }
        if (chat.created_by !== userId) { return forbiddenResponse("Not allowed",); }
        const turn = await latestOpenTurn(db, params.id,);
        if (!turn) {
          return jsonError({ message: "No open story turn to escalate", status: HttpStatus.NotFound, },);
        }

        await db
          .updateTable("story_turns",)
          .set({ status: TurnStatus.Escalated, updated_at: new Date().toISOString(), },)
          .where("id", "=", turn.id,)
          .execute();

        return jsonResponse({ ok: true, turnId: turn.id, status: TurnStatus.Escalated, },);
      },
    );
}
