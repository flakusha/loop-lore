// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Questions Routes.
 *
 * Question-based gameplay endpoints (TASK-029 slice):
 *   POST /api/chats/:id/questions    — create a question (auth)
 *   GET  /api/chats/:id/questions    — list open questions (auth)
 *   POST /api/questions/:id/answer       — answer {optionId} (auth)
 *
 * Chat-scoped routes are gated on chat ownership; answering derives the
 * acting actor server-side from the session (resolvePrimaryActorId).
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import type { RpgQuestionType, } from "../../db/enums-story";
import {
  answerQuestion,
  createQuestion,
  getOpenQuestions,
  type QuestionEffect,
  QuestionError,
} from "../../rpg/questions";
import { can, } from "../../users/permissions";
import { resolvePrimaryActorId, } from "../actor-access";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { answerQuestionBody, createQuestionBody, } from "./questions-schemas";
import type { HandlerOpts, } from "./types";

/**
 * Check chat ownership (creator or admin) — same rule as story-turns.
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 */
async function checkChatOwnership(
  database: Db,
  chatId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database.selectFrom("chats",).select(["created_by",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || can(userRole, "admin.chat",));
}

/**
 * Check the emitting actor belongs to the user (owned character or own
 * player persona) or the user is an admin.
 * @param database
 * @param actorId
 * @param userId
 * @param userRole
 */
async function checkEmitterActor(
  database: Db,
  actorId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  if (can(userRole, "admin.character",)) { return true; }
  const actor = await database.selectFrom("actors",).select(["owner_id", "user_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return false; }
  return actor.owner_id === userId || actor.user_id === userId;
}

/**
 * Map a QuestionError to an HTTP error response.
 * @param error
 * @param fallback
 */
function questionErrorResponse(error: unknown, fallback: string,): Response {
  if (error instanceof QuestionError) {
    const status = error.code === "not_found"
      ? HttpStatus.NotFound
      : error.code === "not_open"
      ? HttpStatus.Conflict
      : HttpStatus.BadRequest;
    return jsonError({ message: error.message, status, },);
  }
  log().error("RPG question request failed", error instanceof Error ? error : undefined,);
  return jsonError({ message: fallback, status: HttpStatus.InternalServerError, },);
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function questionsRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/chats/:id/questions`;

  return new Elysia({ name: "rpg-questions", },)
    // ── Create question ──────────────────────────────────
    .post(R, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id: chatId, } = ctx.params as { id: string };
      if (!(await checkChatOwnership(database, chatId, userId, ctx.userRole ?? null,))) {
        return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
      }
      try {
        const body = ctx.body as {
          actorId: string;
          type: RpgQuestionType;
          prompt: string;
          options: { id: string; text: string }[];
          inputKind?: "choice" | "free_text" | "numeric";
          minValue?: number | null;
          maxValue?: number | null;
          effect?: QuestionEffect;
          timeLimit?: number | null;
          requiredChoice?: number;
        };
        if (!(await checkEmitterActor(database, body.actorId, userId, ctx.userRole ?? null,))) {
          return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
        }
        const question = await createQuestion(database, {
          chatId,
          actorId: body.actorId,
          type: body.type,
          prompt: body.prompt,
          options: body.options,
          inputKind: body.inputKind,
          minValue: body.minValue ?? null,
          maxValue: body.maxValue ?? null,
          effect: body.effect,
          timeLimit: body.timeLimit ?? null,
          requiredChoice: body.requiredChoice ?? 1,
        },);
        return jsonResponse(question, HttpStatus.Created,);
      } catch (error) {
        return questionErrorResponse(error, "Failed to create question",);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: createQuestionBody,
      detail: {
        summary: "Create an RPG question",
        description:
          "Attach a question to a chat: multiple choice (default), free text, or numeric with optional bounds and answer effects.",
        tags: ["RPG", "Questions",],
      },
    },)
    // ── List open questions ──────────────────────────────
    .get(R, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id: chatId, } = ctx.params as { id: string };
      if (!(await checkChatOwnership(database, chatId, userId, ctx.userRole ?? null,))) {
        return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
      }
      const questions = await getOpenQuestions(database, chatId,);
      return jsonResponse({ questions, },);
    }, {
      params: t.Object({ id: t.String(), },),
      detail: {
        summary: "List open RPG questions for a chat",
        description: "Returns the chat's open (unanswered, unexpired) questions.",
        tags: ["RPG", "Questions",],
      },
    },)
    // ── Answer question ──────────────────────────────────
    .post(`${prefix}/questions/:id/answer`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const answeredBy = await resolvePrimaryActorId(database, userId,);
        if (!answeredBy) {
          return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
        }
        const { optionId, value, } = ctx.body as {
          optionId?: string;
          value?: string | number;
        };
        const answered = await answerQuestion(
          database,
          ctx.params.id as string,
          { optionId, value, },
          answeredBy,
        );
        return jsonResponse(answered,);
      } catch (error) {
        return questionErrorResponse(error, "Failed to answer question",);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: answerQuestionBody,
      detail: {
        summary: "Answer an RPG question",
        description:
          "Record the answer (choice option or free text/numeric value), apply the question's effects, and append a system message to the chat. Returns the answered question plus `effectsApplied`.",
        tags: ["RPG", "Questions",],
      },
    },);
}
