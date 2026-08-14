/**
 * NSFW Moderation — block / unblock / ban / unban / shadow / unshadow admin
 * actions against a target user.
 */
import { Elysia, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { blockBody, modBody, requireAdmin, unblockBody, } from "./shared";
import type { HandlerOpts, } from "./types";

export function actionsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-actions", },)
      .post(`${prefix}/nsfw/moderation/block`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const block = await svc.blockUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: block, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: blockBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .post(`${prefix}/nsfw/moderation/unblock`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unblockUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: unblockBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .post(`${prefix}/nsfw/moderation/ban`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const ban = await svc.banUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: ban, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .post(`${prefix}/nsfw/moderation/unban`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unbanUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .post(`${prefix}/nsfw/moderation/shadow`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const shadow = await svc.shadowUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: shadow, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .post(`${prefix}/nsfw/moderation/unshadow`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unshadowUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: modBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
  );
}
