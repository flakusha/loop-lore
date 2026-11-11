// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN choice card routes (C7 Phase 4).
 *
 * GET  /api/chats/:id/vn-choices?sceneIndex=N  — list available choices
 * POST /api/chats/:id/vn-choices/custom        — submit a typed action
 * POST /api/chats/:id/vn-choices/:choiceId/select — select a choice
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { dismissVnChoice, listVnChoices, selectVnChoice, } from "../../chat/service/vn-choices";
import { createCustomVnChoice, } from "../../chat/service/vn-choices-custom";
import type { DB, } from "../../db/schema";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { serviceErrorToResponse, } from "../messages/helpers";
import type { HandlerOpts, } from "./types";

const tChatIdParams = t.Object({ id: t.String(), },);
const tChoiceIdParams = t.Object({ id: t.String(), choiceId: t.String(), },);
const CustomChoiceBodySchema = t.Object({
  /** The player's typed action; capped/trimmed by the service. */
  freeText: t.String(),
  /** Scene the typed action belongs to. */
  sceneIndex: t.Number(),
},);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "vn-choices": { ...; }; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
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
      .post(
        `${prefix}/chats/:id/vn-choices/custom`,
        handleCreateCustomChoice(database,),
        { params: tChatIdParams, body: CustomChoiceBodySchema, },
      )
      .post(
        `${prefix}/chats/:id/vn-choices/:choiceId/dismiss`,
        handleDismissVnChoice(database,),
        { params: tChoiceIdParams, },
      )
  );
}

/**
 * Skip a pending choice without picking one. Reopens free sending.
 * @param database
 */
function handleDismissVnChoice(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard, same shape as select: a choice from another chat must read
    // as not_found rather than being dismissable cross-chat.
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

    const result = await dismissVnChoice(database, { chatId, choiceId, },);
    if ("code" in result) {
      return jsonError(result.message, HttpStatus.NotFound, result.code as never,);
    }

    return jsonResponse({ dismissed: result.choiceId, },);
  };
}

/**
 * Submit a typed action as the player's decision: creates a custom
 * `vn_choices` row, then selects it through the same single-shot path a card
 * click uses, so the response contract matches /select exactly.
 * @param database
 */
function handleCreateCustomChoice(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    // IDOR guard: verify user has access to this chat before authoring a choice.
    const chatId = ctx.params.id;
    const userRole = ctx.userRole as string | null;
    const access = await checkChatAccess(database, chatId, userId, userRole,);
    if (!access.ok) {
      return serviceErrorToResponse(access.error,);
    }

    const body = ctx.body as { freeText?: unknown; sceneIndex?: unknown };

    const created = await createCustomVnChoice(database, {
      chatId,
      sceneIndex: Number(body.sceneIndex,),
      freeText: body.freeText,
    },);

    if ("code" in created) {
      return jsonError(created.message, HttpStatus.BadRequest, created.code as never,);
    }

    // The typed action IS the player's decision: select it through the
    // standard path so history, impacts and the decision gate stay uniform.
    const result = await selectVnChoice(database, {
      chatId,
      choiceId: created.choice.id,
      actingUserId: userId,
    },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);

      return jsonError(result.message, status, result.code as never,);
    }

    return jsonResponse({
      choice: result.choice,
      locationId: result.locationId,
      appliedAt: result.appliedAt,
    },);
  };
}

/**
 * @param database
 */
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

/**
 * @param database
 */
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

    const result = await selectVnChoice(database, { chatId, choiceId, actingUserId: userId, },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);

      return jsonError(result.message, status, result.code as never,);
    }

    return jsonResponse({
      choice: result.choice,
      locationId: result.locationId,
      appliedAt: result.appliedAt,
    },);
  };
}
