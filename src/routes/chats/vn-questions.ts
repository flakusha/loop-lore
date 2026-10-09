// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN question card routes (Q&A interaction loop).
 *
 * GET  /api/chats/:id/vn-questions?sceneIndex=N        — list available questions
 * POST /api/chats/:id/vn-questions/:questionId/answer   — record an answer
 *
 * Mirrors chats/vn-choices.ts: same auth/access pattern, same
 * serviceErrorToResponse mapping so not_found/forbidden stay distinct.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { answerVnQuestion, listVnQuestions, } from "../../chat/service/vn-questions";
import type { DB, } from "../../db/schema";
import { HttpStatus, type HttpStatusCode, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { serviceErrorToResponse, } from "../messages/helpers";
import type { HandlerOpts, } from "./types";

const tChatIdParams = t.Object({ id: t.String(), },);
const tAnswerParams = t.Object({ id: t.String(), questionId: t.String(), },);
const AnswerBodySchema = t.Object({ optionId: t.String(), },);

/** Map a service error code to its HTTP status (mirrors chats/vn-choices.ts). */
function statusForCode(code: string,): HttpStatusCode {
  if (code === "not_found") { return HttpStatus.NotFound; }
  if (code === "forbidden") { return HttpStatus.Forbidden; }
  return HttpStatus.BadRequest;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "vn-questions": { ...; }; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
export function vnQuestionRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-question", },)
      .get(
        `${prefix}/chats/:id/vn-questions`,
        handleListVnQuestions(database,),
        { params: tChatIdParams, },
      )
      .post(
        `${prefix}/chats/:id/vn-questions/:questionId/answer`,
        handleAnswerVnQuestion(database,),
        { params: tAnswerParams, body: AnswerBodySchema, },
      )
  );
}

/**
 * @param database
 */
function handleListVnQuestions(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard: verify user has access to this chat before listing questions.
    const chatId = ctx.params.id;
    const userRole = ctx.userRole as string | null;
    const access = await checkChatAccess(database, chatId, userId, userRole,);
    if (!access.ok) {
      return serviceErrorToResponse(access.error,);
    }

    const sceneIndex = Number(ctx.query.sceneIndex,);

    if (!Number.isInteger(sceneIndex,) || sceneIndex < 0) {
      return jsonError("sceneIndex must be a non-negative integer", HttpStatus.BadRequest,);
    }

    const result = await listVnQuestions(database, { chatId, sceneIndex, },);

    if ("code" in result) {
      return jsonError(result.message, statusForCode(result.code,), result.code as never,);
    }

    return jsonResponse({ questions: result.questions, },);
  };
}

/**
 * @param database
 */
function handleAnswerVnQuestion(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard: verify user has access to this chat before answering.
    const chatId = ctx.params.id;
    const userRole = ctx.userRole as string | null;
    const access = await checkChatAccess(database, chatId, userId, userRole,);
    if (!access.ok) {
      return serviceErrorToResponse(access.error,);
    }

    const questionId = ctx.params.questionId;
    const optionId = (ctx.body as { optionId?: string }).optionId ?? "";

    if (!questionId || !optionId) {
      return jsonError("questionId and optionId are required", HttpStatus.BadRequest,);
    }

    const result = await answerVnQuestion(database, { chatId, questionId, optionId, },);

    if ("code" in result) {
      return jsonError(result.message, statusForCode(result.code,), result.code as never,);
    }

    return jsonResponse({
      question: result.question,
      option: result.option,
      nextSceneId: result.nextSceneId,
      relationshipImpact: result.question.relationship_impact,
      moodImpact: result.question.mood_impact,
    },);
  };
}
