// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN choice card routes (C7 Phase 4).
 *
 * GET  /api/chats/:id/vn-choices?sceneIndex=N  — list available choices
 * POST /api/chats/:id/vn-choices/:choiceId/select — select a choice
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { listVnChoices, selectVnChoice, } from "../../chat/service/vn-choices";
import type { DB, } from "../../db/schema";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { serviceErrorToResponse, } from "../messages/helpers";
import type { HandlerOpts, } from "./types";

const tChatIdParams = t.Object({ id: t.String(), },);
const tChoiceIdParams = t.Object({ id: t.String(), choiceId: t.String(), },);

export function vnChoiceRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-choice", },)
      .get(
        `${prefix}/chats/:id/vn-choices`,
        handleListVnChoices(database,),
        { params: tChatIdParams, },
      )
      .post(
        `${prefix}/chats/:id/vn-choices/:choiceId/select`,
        handleSelectVnChoice(database,),
        { params: tChoiceIdParams, },
      )
  );
}

function handleListVnChoices(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard: verify user has access to this chat before listing choices.
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

    const result = await listVnChoices(database, { chatId, sceneIndex, },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);
      return jsonError(result.message, status, result.code as never,);
    }

    return jsonResponse({ choices: result.choices, },);
  };
}

function handleSelectVnChoice(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard: verify user has access to this chat before selecting a choice.
    const chatId = ctx.params.id;
    const userRole = ctx.userRole as string | null;
    const access = await checkChatAccess(database, chatId, userId, userRole,);
    if (!access.ok) {
      return serviceErrorToResponse(access.error,);
    }
    const choiceId = ctx.params.choiceId;

    if (!choiceId) {
      return jsonError("choiceId is required", HttpStatus.BadRequest,);
    }

    const result = await selectVnChoice(database, { chatId, choiceId, },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);
      return jsonError(result.message, status, result.code as never,);
    }

    return jsonResponse({ choice: result.choice, locationId: result.locationId, },);
  };
}
