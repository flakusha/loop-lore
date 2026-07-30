/**
 * NSFW Moderation Routes
 *
 * REST endpoints for NSFW moderation safety infrastructure.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { NsfwModerationService, } from "../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "nsfw-moderation-routes", },);
}

interface HandlerOpts { database: Kysely<DB>; }

export function nsfwModerationRoutes(opts: HandlerOpts,) {
  const svc = new NsfwModerationService(opts.database,);

  return new Elysia({ name: "nsfw-moderation", },)

    // ── User Preferences ───────────────────────────────

    .get(
      "/api/nsfw/moderation/preferences/:userId",
      async (ctx: any,) => {
        try {
          const prefs = await svc.getPreferences(ctx.params.userId,);
          return jsonResponse({ ...SuccessResponse, data: prefs, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          const logErr = error instanceof Error ? error : undefined;
          log().error("Failed to get NSFW preferences", logErr,);
          return jsonError(msg, 500,);
        }
      },
      {
        params: t.Object({ userId: t.String(), },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 500: ErrorResponse, },
      },
    )

    .put(
      "/api/nsfw/moderation/preferences/:userId",
      async (ctx: any,) => {
        try {
          const prefs = await svc.updatePreferences(ctx.params.userId, ctx.body,);
          return jsonResponse({ ...SuccessResponse, data: prefs, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          const logErr2 = error instanceof Error ? error : undefined;
          log().error("Failed to update NSFW preferences", logErr2,);
          return jsonError(msg, 500,);
        }
      },
      {
        params: t.Object({ userId: t.String(), },),
        body: t.Object({
          nsfwEnabled: t.Optional(t.Boolean(),),
          maxRating: t.Optional(t.String(),),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 500: ErrorResponse, },
      },
    )

    // ── Block / Ban / Shadow ─────────────────────────

    .post(
      "/api/nsfw/moderation/block",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const block = await svc.blockUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: block, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 400: ErrorResponse, },
      },
    )

    .post(
      "/api/nsfw/moderation/unblock",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unblockUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), },), 400: ErrorResponse, },
      },
    )

    .post(
      "/api/nsfw/moderation/ban",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const ban = await svc.banUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: ban, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 400: ErrorResponse, },
      },
    )

    .post(
      "/api/nsfw/moderation/unban",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unbanUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), },), 400: ErrorResponse, },
      },
    )

    .post(
      "/api/nsfw/moderation/shadow",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          const shadow = await svc.shadowUser(targetUserId, performedBy, reason,);
          return jsonResponse({ ...SuccessResponse, data: shadow, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 400: ErrorResponse, },
      },
    )

    .post(
      "/api/nsfw/moderation/unshadow",
      async (ctx: any,) => {
        try {
          const { targetUserId, performedBy, reason, } = ctx.body;
          await svc.unshadowUser(targetUserId, performedBy, reason,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          targetUserId: t.String(),
          performedBy: t.String(),
          reason: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), },), 400: ErrorResponse, },
      },
    )

    // ── Content Flags ─────────────────────────────────

    .post(
      "/api/nsfw/moderation/flags",
      async (ctx: any,) => {
        try {
          const flag = await svc.flagContent(ctx.body,);
          return jsonResponse({ ...SuccessResponse, data: flag, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        body: t.Object({
          reporterId: t.String(),
          contentType: t.String(),
          contentId: t.String(),
          chatId: t.Optional(t.String(),),
          worldId: t.Optional(t.String(),),
          flagReason: t.String(),
          description: t.Optional(t.String(),),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 400: ErrorResponse, },
      },
    )

    .get(
      "/api/nsfw/moderation/flags",
      async (ctx: any,) => {
        try {
          const status = ctx.query.status as string | undefined;
          const limit = ctx.query.limit ? Number(ctx.query.limit,) : undefined;
          const offset = ctx.query.offset ? Number(ctx.query.offset,) : undefined;
          const result = await svc.getFlagQueue({ status, limit, offset, },);
          return jsonResponse({ ...SuccessResponse, data: result, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 500,);
        }
      },
      {
        query: t.Object({
          status: t.Optional(t.String(),),
          limit: t.Optional(t.Numeric(),),
          offset: t.Optional(t.Numeric(),),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 500: ErrorResponse, },
      },
    )

    .put(
      "/api/nsfw/moderation/flags/:id",
      async (ctx: any,) => {
        try {
          const { resolution, status, resolvedBy, } = ctx.body;
          const flag = await svc.resolveFlag(ctx.params.id, resolvedBy, resolution, status,);
          return jsonResponse({ ...SuccessResponse, data: flag, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 400,);
        }
      },
      {
        params: t.Object({ id: t.String(), },),
        body: t.Object({
          resolution: t.String(),
          status: t.Union([t.Literal("resolved",), t.Literal("dismissed",), t.Literal("confirmed",),],),
          resolvedBy: t.String(),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 400: ErrorResponse, },
      },
    )

    // ── Audit ─────────────────────────────────────────

    .get(
      "/api/nsfw/moderation/audit/:userId",
      async (ctx: any,) => {
        try {
          const limit = ctx.query.limit ? Number(ctx.query.limit,) : undefined;
          const offset = ctx.query.offset ? Number(ctx.query.offset,) : undefined;
          const actions = await svc.getAuditLog(ctx.params.userId, { limit, offset, },);
          return jsonResponse({ ...SuccessResponse, data: actions, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 500,);
        }
      },
      {
        params: t.Object({ userId: t.String(), },),
        query: t.Object({
          limit: t.Optional(t.Numeric(),),
          offset: t.Optional(t.Numeric(),),
        },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 500: ErrorResponse, },
      },
    )

    .get(
      "/api/nsfw/moderation/export/:userId",
      async (ctx: any,) => {
        try {
          const data = await svc.exportUserData(ctx.params.userId,);
          return jsonResponse({ ...SuccessResponse, data, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 500,);
        }
      },
      {
        params: t.Object({ userId: t.String(), },),
        response: { 200: t.Object({ success: t.Boolean(), data: t.Unknown(), },), 500: ErrorResponse, },
      },
    )

    .delete(
      "/api/nsfw/moderation/export/:userId",
      async (ctx: any,) => {
        try {
          await svc.deleteUserData(ctx.params.userId,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 500,);
        }
      },
      {
        params: t.Object({ userId: t.String(), },),
        response: { 200: t.Object({ success: t.Boolean(), },), 500: ErrorResponse, },
      },
    );
}
