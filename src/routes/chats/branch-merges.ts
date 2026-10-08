// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Conversation content-merge routes (FEA-2026-047).
 *
 * Four endpoints under `/chats/:id/branch-merges`, composed into
 * `chatBranchRoutes` so they inherit the existing mount chain. Responses use
 * the `{ data }` envelope of `branchRoute`; the merge-domain error set is a
 * superset of `ServiceError`, so `statusFor` is extended here for the
 * `conflict` (409) and `llm_*` (502-family) cases.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import {
  buildPreview,
  type BuildPreviewResult,
  confirmMerge,
  type ConfirmMergeResult,
  continueFromMerge,
  type ContinueFromMergeResult,
  initiateMerge,
  type InitiateMergeResult,
  type MergeError,
  type MergeMode,
} from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import {
  BranchMergeConfirmBody,
  BranchMergeContinueBody,
  BranchMergeInitiateBody,
  BranchMergeParams,
  BranchMergePreviewBody,
} from "../../validation/schemas";
import {
  HttpStatus,
  type HttpStatusCode,
  jsonCreated,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import { ChatIdParams, } from "./branch-shared";
import type { HandlerOpts, } from "./types";

/**
 * Map a merge-domain error to HTTP status. Superset of `statusFor`:
 * `conflict` → 409, the LLM family → 502.
 * @param code
 * @returns {number}
 */
function mergeStatusFor(code: MergeError["code"],): HttpStatusCode {
  if (code === "not_found") { return HttpStatus.NotFound; }
  if (code === "forbidden") { return HttpStatus.Forbidden; }
  if (code === "conflict") { return HttpStatus.Conflict; }
  if (code === "llm_unavailable" || code === "llm_parse") { return HttpStatus.BadGateway; }
  return HttpStatus.BadRequest;
}

/**
 * Wrap a merge route handler: session guard, the merge error → HTTP mapping,
 * and the `{ data }` success envelope. `envelope` overrides the default 200
 * body for create verbs, which answer 201.
 * @param run
 * @param envelope
 * @returns the Elysia handler
 */
function mergeRoute<P extends { id: string }, R extends object,>(
  run: (params: P, actorId: string, ctx: { body?: unknown },) => Promise<R>,
  envelope: (payload: R,) => Response = (payload,) => jsonCreated({ data: payload, },),
) {
  return async (ctx: { params: unknown; body?: unknown; [key: string]: unknown },) => {
    const userId = requireUserId(ctx as never,);
    if (typeof userId !== "string") { return userId; }
    const result = await run(ctx.params as P, userId, ctx,);
    if ("code" in result) {
      const error = result as unknown as MergeError;
      return jsonError(error.message, mergeStatusFor(error.code,), error.code as never,);
    }

    return envelope(result,);
  };
}

/**
 * The four content-merge routes. Composed into `chatBranchRoutes`.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function branchMergeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  return new Elysia({ name: "chats-branch-merges", },)
    .post(`${prefix}/chats/:id/branch-merges`, handleInitiate(database, config,), {
      params: ChatIdParams.params,
      body: BranchMergeInitiateBody,
      detail: { summary: "Initiate a conversation content merge", tags: ["Chats",], },
    },)
    .post(`${prefix}/chats/:id/branch-merges/:mergeId/preview`, handlePreview(database, config,), {
      params: BranchMergeParams,
      body: BranchMergePreviewBody,
      detail: { summary: "Build a merge preview", tags: ["Chats",], },
    },)
    .post(`${prefix}/chats/:id/branch-merges/:mergeId/confirm`, handleConfirm(database, config,), {
      params: BranchMergeParams,
      body: BranchMergeConfirmBody,
      detail: { summary: "Confirm a merge and materialise the result", tags: ["Chats",], },
    },)
    .post(`${prefix}/chats/:id/branch-merges/:mergeId/continue`, handleContinue(database, config,), {
      params: BranchMergeParams,
      body: BranchMergeContinueBody,
      detail: { summary: "Continue from a confirmed merge", tags: ["Chats",], },
    },);
}

/** POST /chats/:id/branch-merges */

function handleInitiate(database: Kysely<DB>, config: Config,) {
  return mergeRoute<{ id: string }, InitiateMergeResult>(
    ({ id: chatId, }, actorId, ctx,) => {
      const body = ctx.body as {
        mode: MergeMode;
        sourceTips: { tipMessageId: string; branchId?: string }[];
        idempotencyKey?: string;
      };

      return initiateMerge({
        database,
        config,
        params: {
          chatId,
          actorId,
          userRole: null,
          mode: body.mode,
          sourceTips: body.sourceTips,
          idempotencyKey: body.idempotencyKey,
        },
      },);
    },
  );
}

/** POST /chats/:id/branch-merges/:mergeId/preview */

function handlePreview(database: Kysely<DB>, config: Config,) {
  return mergeRoute<{ id: string; mergeId: string }, BuildPreviewResult>(
    ({ id: chatId, mergeId, }, actorId, ctx,) => {
      const body = ctx.body as { regenerate?: boolean; styleHint?: string };
      return buildPreview({
        database,
        config,
        params: {
          chatId,
          mergeId,
          actorId,
          userRole: null,
          regenerate: body.regenerate,
          styleHint: body.styleHint,
        },
      },);
    },
    (payload,) => jsonResponse({ data: payload, },),
  );
}

/** POST /chats/:id/branch-merges/:mergeId/confirm */

function handleConfirm(database: Kysely<DB>, config: Config,) {
  return mergeRoute<{ id: string; mergeId: string }, ConfirmMergeResult>(
    ({ id: chatId, mergeId, }, actorId, ctx,) => {
      const body = ctx.body as {
        content?: { role: string; content: string }[];
        conflictChoices?: { hunkIndex: number; resolution: "base" | "overlay" | "manual" }[];
        branchName?: string;
        activate?: boolean;
      };

      return confirmMerge({
        database,
        config,
        params: {
          chatId,
          mergeId,
          actorId,
          userRole: null,
          content: body.content,
          conflictChoices: body.conflictChoices,
          branchName: body.branchName,
          activate: body.activate,
        },
      },);
    },
    (payload,) => jsonResponse({ data: payload, },),
  );
}

/** POST /chats/:id/branch-merges/:mergeId/continue */

function handleContinue(database: Kysely<DB>, config: Config,) {
  return mergeRoute<{ id: string; mergeId: string }, ContinueFromMergeResult>(
    ({ id: chatId, mergeId, }, actorId, ctx,) => {
      const body = ctx.body as { prompt?: string; actorId?: string };
      return continueFromMerge({
        database,
        config,
        params: {
          chatId,
          mergeId,
          actorId,
          userRole: null,
          prompt: body.prompt,
          responderId: body.actorId,
        },
        request: (ctx as { request: Request }).request,
      },);
    },
  );
}
