// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — block / unblock / ban / unban / shadow / unshadow admin
 * actions against a target user.
 *
 * Security: `performedBy` MUST be derived from `ctx.userId`, never from the
 * request body. A `beforeHandle` hook (running after TypeBox parse but
 * before the route handler) inspects `ctx.body` directly and rejects any
 * request whose body carries a `performedBy` key. Since TypeBox-validated
 * bodies may strip unknown keys per Elysia parser config, we also enforce
 * the closed-schema posture via `additionalProperties: false` on the
 * relevant schemas. `performedBy` is sourced from the authenticated
 * session (`requireModerationAction(ctx)`).
 */
import { Elysia, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { blockBody, modBody, requireModerationAction, unblockBody, } from "./shared";
import type { HandlerOpts, } from "./types";

const PERFORMED_BY_REJECT = "performedBy must be derived from the authenticated session, not the request body.";

/**
 * beforeHandle: reject any request whose parsed body contains a `performedBy` key.
 * @param ctx
 */
function rejectBodyImpersonation(ctx: any,): Response | undefined {
  const body = ctx.body;
  if (!body || typeof body !== "object" || Array.isArray(body,)) { return; }
  if (Object.prototype.hasOwnProperty.call(body, "performedBy",)) {
    return jsonError(PERFORMED_BY_REJECT, 400,);
  }
  return;
}

/**
 * @param opts
 * @param prefix
 */
export function actionsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return new Elysia({ name: "nsfw-moderation-actions", },)
    .guard({
      as: "scoped",
      beforeHandle: [rejectBodyImpersonation,],
    },)
    .post(`${prefix}/nsfw/moderation/block`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, reason, } = ctx.body as { targetUserId: string; reason: string };
        const block = await svc.blockUser(targetUserId, auth, reason,);
        return jsonResponse({ ...SuccessResponse, data: block, },);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: blockBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
    .post(`${prefix}/nsfw/moderation/unblock`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, } = ctx.body as { targetUserId: string };
        await svc.unblockUser(targetUserId, auth, "",);
        return jsonResponse(SuccessResponse,);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: unblockBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
    .post(`${prefix}/nsfw/moderation/ban`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, reason, } = ctx.body as { targetUserId: string; reason: string };
        const ban = await svc.banUser(targetUserId, auth, reason,);
        return jsonResponse({ ...SuccessResponse, data: ban, },);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
    .post(`${prefix}/nsfw/moderation/unban`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, reason, } = ctx.body as { targetUserId: string; reason?: string };
        await svc.unbanUser(targetUserId, auth, reason ?? "",);
        return jsonResponse(SuccessResponse,);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
    .post(`${prefix}/nsfw/moderation/shadow`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, reason, } = ctx.body as { targetUserId: string; reason?: string };
        const shadow = await svc.shadowUser(targetUserId, auth, reason ?? "",);
        return jsonResponse({ ...SuccessResponse, data: shadow, },);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
    .post(`${prefix}/nsfw/moderation/unshadow`, async (ctx: any,) => {
      const auth = requireModerationAction(ctx,);
      if (typeof auth !== "string") { return auth; }
      try {
        const { targetUserId, reason, } = ctx.body as { targetUserId: string; reason?: string };
        await svc.unshadowUser(targetUserId, auth, reason ?? "",);
        return jsonResponse(SuccessResponse,);
      } catch (error: unknown) {
        return jsonError(error instanceof Error ? error.message : String(error,), 400,);
      }
    }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },);
}
