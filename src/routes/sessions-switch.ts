// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Session switch route (split from sessions.ts per 250L size guard).
 *
 * POST /api/sessions/:id/switch - switch the active session: verifies
 * ownership and expiry, touches last_activity, and rotates the session
 * cookie to the target session.
 */
import { Elysia, t, } from "elysia";
import { signJwt, } from "../auth/jwt";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { getLogger, } from "../logger";
import { parseExpiryMs, } from "../utils/date";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { setTokenCookie, } from "./auth/shared";
import { HttpStatus, jsonError, requireUserId, } from "./http-utils";

interface SwitchOpts {
  database: Db;
  config: Config;
}

/**
 * @param opts
 * @param prefix
 */
export function switchSessionRoutes(opts: SwitchOpts, prefix = "/api",): Elysia {
  const { database, config, } = opts;
  const log = getLogger().child({ module: "sessions-switch", },);
  return new Elysia({ name: "sessions-switch", },).post(
    `${prefix}/sessions/:id/switch`,
    async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const targetId = (ctx as any).params.id as string;
      const row = await database
        .selectFrom("sessions",)
        .select(["id", "expires_at",],)
        .where("id", "=", targetId,)
        .where("user_id", "=", userId,)
        .executeTakeFirst();
      if (!row) { return notFound("Session not found",); }
      const expiresAtMs = parseExpiryMs(row.expires_at,);
      if (expiresAtMs === null || expiresAtMs <= Date.now()) {
        await database.deleteFrom("sessions",).where("id", "=", targetId,).execute();
        return jsonError({ message: "Session expired", status: HttpStatus.Gone, },);
      }
      const user = await database
        .selectFrom("users",)
        .select(["id", "role",],)
        .where("id", "=", userId,)
        .executeTakeFirst();
      if (!user) { return notFound("Session not found",); }
      const jwtSecret = config.auth.jwtSecret;
      if (!jwtSecret) {
        return jsonError({
          message: "Server misconfigured: JWT secret not set",
          status: HttpStatus.InternalServerError,
        },);
      }
      await database
        .updateTable("sessions",)
        .set({ last_activity: new Date().toISOString(), },)
        .where("id", "=", targetId,)
        .execute();
      const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
      const token = await signJwt({
        secret: jwtSecret,
        userId,
        role: user.role,
        sessionId: targetId,
        expiresInSeconds: jwtExpiresIn,
      },);
      log.info("Session switched", { sessionId: targetId, byUserId: userId, },);
      return new Response("OK", {
        status: HttpStatus.OK,
        headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
      },);
    },
    {
      params: t.Object({ id: t.String(), },),
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
        410: ErrorResponse,
        500: ErrorResponse,
      },
      detail: {
        summary: "Switch session",
        description:
          "Switch the active session. Verifies ownership and expiry, then rotates the session cookie to the target session.",
        tags: ["Sessions",],
      },
    },
  );
}
