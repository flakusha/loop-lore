// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness turn queue API (TASK-harness-multi-agent-turn-queue): enqueue a
 * batch of per-profile harness turns, list the queue's state, cancel a turn
 * that has not started. Admin-gated like the rest of the harness surface.
 * The queue is a process singleton composed at boot (start.ts), so an
 * unbooted or disabled integration reads 503 — the surface is inert, never
 * auto-anything.
 */
import { Elysia, t, } from "elysia";
import {
  HarnessQueueCancelResponse,
  HarnessQueueEnqueueResponse,
  HarnessQueueResponse,
} from "../../frontend/alpine/admin-harness-schema";
import { getHarnessTurnQueue, HarnessQueueError, } from "../../integrations/harness/queue";
import { MAX_QUEUE_LIMIT, } from "../../integrations/harness/queue-store";
import { getChildLogger, } from "../../logger";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Error when the queue is not composed (integration disabled / not booted). */
const NOT_COMPOSED = {
  message: "harness queue not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/** One enqueued turn: profile + prompt + the chat/actor the rows land in. */
const turnSpec = t.Object({
  profile: t.String({ minLength: 1, },),
  prompt: t.String({ minLength: 1, },),
  chatId: t.String({ minLength: 1, },),
  actorId: t.String({ minLength: 1, },),
  turnKey: t.Optional(t.String({ minLength: 1, },),),
},);

/** The enqueue body: one or more turns; all turns of the POST share a batch.
 * Emptiness is the SERVICE's refusal (a typed `empty_batch` → 400), not a
 * schema minimum — one refusal vocabulary, not two. */
const enqueueBody = t.Object({
  turns: t.Array(turnSpec,),
  batchId: t.Optional(t.String({ minLength: 1, },),),
},);

/**
 * Build the harness queue route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessQueueRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-queue", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .post(`${prefix}/harness/queue`, async (ctx,) => {
          const queue = getHarnessTurnQueue();
          if (!queue) { return jsonError(NOT_COMPOSED,); }

          // The turn runs LATER under this principal: snapshot it at enqueue
          // time so the dispatch gate re-judges the enqueueing identity.
          const principal = ctx as { userId?: string; userRole?: string };
          if (!principal.userId) {
            return jsonError({
              message: "queue enqueue requires an authenticated principal",
              status: HttpStatus.Unauthorized,
              code: ErrorCode.Unauthorized,
            },);
          }

          const body = ctx.body as {
            turns: { profile: string; prompt: string; chatId: string; actorId: string; turnKey?: string }[];
            batchId?: string;
          };

          try {
            return jsonResponse(
              await queue.enqueue({
                requestedBy: principal.userId,
                requestedRole: principal.userRole ?? null,
                turns: body.turns,
                batchId: body.batchId,
              },),
            );
          } catch (error) {
            if (error instanceof HarnessQueueError) {
              return error.code === "harness_disabled"
                ? jsonError(NOT_COMPOSED,)
                : jsonError({
                  message: error.message,
                  status: HttpStatus.BadRequest,
                  code: ErrorCode.BadRequest,
                },);
            }

            getChildLogger("routes.harness",)?.error("Harness queue enqueue failed", error as Error,);
            return jsonError({
              message: "Harness queue enqueue failed",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
        }, {
          body: enqueueBody,
          response: { 200: HarnessQueueEnqueueResponse, 400: ErrorResponse, 503: ErrorResponse, ...denied, },
        },)
        .get(`${prefix}/harness/queue`, async (ctx,) => {
          const queue = getHarnessTurnQueue();
          if (!queue) { return jsonError(NOT_COMPOSED,); }

          const q = ctx.query as Record<string, string | undefined>;
          const limit = Number.parseInt(q.limit ?? "", 10,);
          const items = await queue.listTurns({
            batchId: q.batchId,
            limit: Number.isFinite(limit,) && limit > 0
              ? Math.min(Math.trunc(limit,), MAX_QUEUE_LIMIT,)
              : undefined,
          },);

          return jsonResponse({ items, },);
        }, {
          query: t.Object({
            batchId: t.Optional(t.String({},),),
            limit: t.Optional(t.String({},),),
          },),
          response: { 200: HarnessQueueResponse, ...denied, },
        },)
        .post(`${prefix}/harness/queue/turns/:id/cancel`, async (ctx,) => {
          const queue = getHarnessTurnQueue();
          if (!queue) { return jsonError(NOT_COMPOSED,); }

          const { id, } = ctx.params as { id: string };
          const result = await queue.cancel(id,);
          if (result.ok) { return jsonResponse({ ok: true, },); }

          return result.code === "unknown_turn"
            ? jsonError({
              message: `Queue turn "${id}" not found`,
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },)
            : jsonError({
              message: result.reason,
              status: HttpStatus.Conflict,
              code: ErrorCode.Conflict,
            },);
        }, {
          params: t.Object({ id: t.String({ minLength: 1, },), },),
          response: { 200: HarnessQueueCancelResponse, 404: ErrorResponse, 409: ErrorResponse, ...denied, },
        },),);
}
