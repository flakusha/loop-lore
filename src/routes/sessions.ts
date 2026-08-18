// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Session Routes
 *
 *   GET    /api/sessions          — list user's sessions (admin sees all)
 *   GET    /api/sessions/:id      — get session details (admin or self)
 *   DELETE /api/sessions/:id      — force-logout / delete session (admin or self)
 *
 * Sessions represent active logins. Each session holds a token hash,
 * IP, user-agent, and expiry. The raw token is never stored or returned.
 */

import { Elysia, t, } from "elysia";
import type { Db, } from "../db";
import { getLogger, } from "../logger";
import type { Logger, } from "../logger/types";
import { can, } from "../users/permissions";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, requireUserId, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "sessions", },);
}

interface HandleOpts {
  database: Db;
}

/** Safe session response — strips token_hash, shows current flag */
function sanitizeSession(
  session: {
    id: string;
    user_id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    last_activity: string;
    expires_at: string;
  },
  currentSessionId: string | null,
) {
  return {
    id: session.id,
    userId: session.user_id,
    ip: session.ip,
    userAgent: session.user_agent,
    createdAt: session.created_at,
    lastActivity: session.last_activity,
    expiresAt: session.expires_at,
    isCurrent: session.id === currentSessionId,
  };
}

export function sessionsRoutes(opts: HandleOpts, prefix = "/api",): Elysia {
  const { database, } = opts;

  return (
    new Elysia({ name: "sessions", },)
      /**
       * GET /api/sessions
       *
       * List sessions for the authenticated user.
       * Admin users can see all sessions; regular users only see their own.
       * Query params: ?page=1&pageSize=50
       */
      .get(`${prefix}/sessions`, async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = (ctx as any).userRole as string | null;
        const sessionId = (ctx as any).sessionId as string | null;

        const { page, pageSize, } = parsePagination(new URL(ctx.request.url,).searchParams,);
        const isAdmin = can(userRole, "admin.users",);

        const baseQuery = database
          .selectFrom("sessions",)
          .select(["id", "user_id", "ip", "user_agent", "created_at", "last_activity", "expires_at",],);

        const filteredQuery = isAdmin ? baseQuery : baseQuery.where("user_id", "=", userId,);

        const countQuery = isAdmin
          ? database.selectFrom("sessions",).select(database.fn.count("id",).as("count",),)
          : database
            .selectFrom("sessions",)
            .select(database.fn.count("id",).as("count",),)
            .where("user_id", "=", userId,);

        const [rowsRes, countRes,] = await Promise.allSettled([
          filteredQuery
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset((page - 1) * pageSize,)
            .execute(),
          countQuery.executeTakeFirst(),
        ],);
        const rows = rowsRes.status === "fulfilled" ? rowsRes.value : [];
        const countResult = countRes.status === "fulfilled" ? countRes.value : undefined;

        const total = Number(countResult?.count ?? 0,);
        const sessions = Array.from(rows, (s,) => sanitizeSession(s, sessionId,),);

        return jsonResponse({
          data: sessions,
          pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize,), },
        },);
      }, {
        response: {
          200: t.Object({
            data: t.Array(t.Any(),),
            pagination: t.Object({
              page: t.Number(),
              pageSize: t.Number(),
              total: t.Number(),
              totalPages: t.Number(),
            },),
          },),
          401: ErrorResponse,
        },
        detail: {
          summary: "List sessions",
          description:
            "List sessions for the authenticated user. Admin users see all sessions; regular users only see their own.",
          tags: ["Sessions",],
        },
      },)
      /**
       * GET /api/sessions/:id
       *
       * Get details for a specific session.
       * Admin can view any session; regular users can only view their own.
       */
      .get(
        `${prefix}/sessions/:id`,
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = (ctx as any).userRole as string | null;
          const currentSessionId = (ctx as any).sessionId as string | null;
          const targetId = (ctx as any).params.id as string;

          const session = await database
            .selectFrom("sessions",)
            .select(["id", "user_id", "ip", "user_agent", "created_at", "last_activity", "expires_at",],)
            .where("id", "=", targetId,)
            .executeTakeFirst();

          if (!session) { return notFound("Session not found",); }

          if (!can(userRole, "admin.users",) && session.user_id !== userId) {
            return notFound("Session not found",);
          }

          return jsonResponse(sanitizeSession(session, currentSessionId,),);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get session",
            description:
              "Get details for a specific session. Admin can view any session; regular users can only view their own.",
            tags: ["Sessions",],
          },
        },
      )
      /**
       * DELETE /api/sessions/:id
       *
       * Delete a session (force-logout).
       * Admin can delete any session; regular users can only delete their own.
       * Users cannot delete their current session via this endpoint
       * (use /api/auth/logout instead).
       */
      .delete(
        `${prefix}/sessions/:id`,
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = (ctx as any).userRole as string | null;
          const currentSessionId = (ctx as any).sessionId as string | null;
          const targetId = (ctx as any).params.id as string;

          const session = await database
            .selectFrom("sessions",)
            .select(["id", "user_id",],)
            .where("id", "=", targetId,)
            .executeTakeFirst();

          if (!session) { return notFound("Session not found",); }

          if (!can(userRole, "admin.users",) && session.user_id !== userId) {
            return notFound("Session not found",);
          }

          if (targetId === currentSessionId) {
            return jsonError({
              message: (ctx as any).t?.("sessions.cannotDeleteCurrent",) ??
                "Cannot delete current session. Use /api/auth/logout instead.",
              status: HttpStatus.BadRequest,
            },);
          }

          await database.deleteFrom("sessions",).where("id", "=", targetId,).execute();

          log().info("Session deleted", { sessionId: targetId, byUserId: userId, },);

          return jsonNoContent();
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            204: t.Void(),
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Delete session",
            description:
              "Force-logout a session. Admin can delete any session; regular users can only delete their own. Cannot delete current session (use /api/auth/logout instead).",
            tags: ["Sessions",],
          },
        },
      )
  );
}
