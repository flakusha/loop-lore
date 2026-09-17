// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Orchestration Routes
 *
 * Wires the story-engine surface into the HTTP API per
 * docs/frontend/chat/multi-llm-story.md § API Endpoints:
 *
 *   GET  /api/chats/:chatId/story/state      — turn state snapshot
 *   POST /api/chats/:chatId/story/pause      — pause generation
 *   POST /api/chats/:chatId/story/resume     — resume generation
 *   POST /api/chats/:chatId/story/step       — execute a single GM turn
 *   POST /api/chats/:chatId/story/configure  — strategy/maxTurns/thresholds
 *   POST /api/chats/:chatId/story/narration  — inject a narration beat
 *   POST /api/chats/:chatId/gm/escalate      — escalate the latest open turn
 */
import { Elysia, t, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { TurnStrategy, } from "../../db/enums";
import { TurnStatus, } from "../../db/enums-story/turns";
import { safeJsonStringify, } from "../../utils";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
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
  prefix = "/api",
): Elysia {
  const db = opts.database;

  return new Elysia({ name: "story-orchestration", },)
    .get(
      `${prefix}/chats/:chatId/story/state`,
      async ({ params, }: { params: { chatId: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
        await gm.initialize();
        return jsonResponse({
          chatId: params.chatId,
          currentTurn: gm.currentTurn,
          isPaused: gm.isPaused,
          isComplete: gm.isComplete,
        },);
      },
    )
    .post(
      `${prefix}/chats/:chatId/story/pause`,
      async ({ params, }: { params: { chatId: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.pause();
        return jsonResponse({ ok: true, isPaused: true, },);
      },
    )
    .post(
      `${prefix}/chats/:chatId/story/resume`,
      async ({ params, }: { params: { chatId: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.resume();
        return jsonResponse({ ok: true, isPaused: false, },);
      },
    )
    .post(
      `${prefix}/chats/:chatId/story/step`,
      async ({ params, body, }: { params: { chatId: string }; body: { forceActorId?: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
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
      `${prefix}/chats/:chatId/story/configure`,
      async ({ params, body, }: {
        params: { chatId: string };
        body: { turnStrategy?: TurnStrategy; maxTurns?: number; qualityThresholds?: Record<string, number> };
      },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
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
          .where("id", "=", params.chatId,)
          .execute();
        return jsonResponse({ ok: true, },);
      },
      { body: ConfigureBody, },
    )
    .post(
      `${prefix}/chats/:chatId/story/narration`,
      async ({ params, body, }: { params: { chatId: string }; body: { text: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        if (!chat.world_id) {
          return jsonError({
            message: "Chat has no world — narration requires a world context",
            status: HttpStatus.BadRequest,
          },);
        }
        const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
        await gm.initialize();
        await gm.injectNarration(chat.world_id, body.text,);
        return jsonResponse({ ok: true, },);
      },
      { body: NarrationBody, },
    )
    .post(
      `${prefix}/chats/:chatId/gm/escalate`,
      async ({ params, }: { params: { chatId: string } },) => {
        const chat = await loadChat(db, params.chatId,);
        if (!chat) { return notFound(); }
        const turn = await latestOpenTurn(db, params.chatId,);
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
