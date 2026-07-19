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
import { notFound, unauthorized, } from "../validation/middleware";
import { HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, } from "./http-utils";

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

export function sessionsRoutes(opts: HandleOpts,): Elysia {
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
      .get("/api/sessions", async (ctx,) => {
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const sessionId = (ctx as any).sessionId as string | null;

        if (!userId) { return unauthorized(); }

        const { page, pageSize, } = parsePagination(new URL(ctx.request.url,).searchParams,);
        const isAdmin = userRole === "admin";

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

        const [rows, countResult,] = await Promise.all([
          filteredQuery
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset((page - 1) * pageSize,)
            .execute(),
          countQuery.executeTakeFirst(),
        ],);

        const total = Number(countResult?.count ?? 0,);
        const sessions = rows.map((s,) => sanitizeSession(s, sessionId,));

        return jsonResponse({
          data: sessions,
          pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize,), },
        },);
      },)
      /**
       * GET /api/sessions/:id
       *
       * Get details for a specific session.
       * Admin can view any session; regular users can only view their own.
       */
      .get(
        "/api/sessions/:id",
        async (ctx,) => {
          const userId = (ctx as any).userId as string | null;
          const userRole = (ctx as any).userRole as string | null;
          const currentSessionId = (ctx as any).sessionId as string | null;
          const targetId = (ctx as any).params.id as string;

          if (!userId) { return unauthorized(); }

          const session = await database
            .selectFrom("sessions",)
            .select(["id", "user_id", "ip", "user_agent", "created_at", "last_activity", "expires_at",],)
            .where("id", "=", targetId,)
            .executeTakeFirst();

          if (!session) { return notFound("Session not found",); }

          if (session.user_id !== userId && userRole !== "admin") {
            return notFound("Session not found",);
          }

          return jsonResponse(sanitizeSession(session, currentSessionId,),);
        },
        { params: t.Object({ id: t.String(), },), },
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
        "/api/sessions/:id",
        async (ctx,) => {
          const userId = (ctx as any).userId as string | null;
          const userRole = (ctx as any).userRole as string | null;
          const currentSessionId = (ctx as any).sessionId as string | null;
          const targetId = (ctx as any).params.id as string;

          if (!userId) { return unauthorized(); }

          const session = await database
            .selectFrom("sessions",)
            .select(["id", "user_id",],)
            .where("id", "=", targetId,)
            .executeTakeFirst();

          if (!session) { return notFound("Session not found",); }

          if (session.user_id !== userId && userRole !== "admin") {
            return notFound("Session not found",);
          }

          if (targetId === currentSessionId) {
            return jsonError({
              message: "Cannot delete current session. Use /api/auth/logout instead.",
              status: HttpStatus.BadRequest,
            },);
          }

          await database.deleteFrom("sessions",).where("id", "=", targetId,).execute();

          log().info("Session deleted", { sessionId: targetId, byUserId: userId, },);

          return jsonNoContent();
        },
        { params: t.Object({ id: t.String(), },), },
      ) as unknown as Elysia
  );
}
