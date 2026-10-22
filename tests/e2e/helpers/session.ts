// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Session Helper
 *
 * Mints a live session for a user without going through
 * POST /api/v1/auth/login. The login endpoint is guarded by a
 * process-global, per-IP rate limiter, so in a full-suite run the shared
 * budget is exhausted and later files fail with 429. A sessions row plus a
 * signed JWT is exactly what the login endpoint produces, so tests that
 * only need an authenticated identity mint one directly and stay
 * deterministic regardless of suite order.
 */

import { signJwt, } from "@/auth/jwt";
import type { DB, } from "@/db/schema";
import { mintCsrfToken, } from "@/middleware/csrf";
import type { Kysely, } from "kysely";
import { loadTestConfig, } from "./server";

/** A live session plus the credentials that authenticate it. */
export interface TestSession {
  /** The session id (also the CSRF token binding). */
  sessionId: string;
  /** The signed JWT to present as `ll_token` / `Authorization: Bearer`. */
  token: string;
  /** A CSRF token bound to this session. */
  csrf: string;
}

/**
 * Create a live session for a user: a sessions row plus a signed JWT.
 * @param db the test database
 * @param userId the session owner
 * @param role the owner's role claim (`UserRole`)
 * @returns the session id and token
 */
export async function createTestSession(
  db: Kysely<DB>,
  userId: string,
  role: string,
): Promise<TestSession> {
  const secret = loadTestConfig().auth.jwtSecret ?? "";
  const sessionId = crypto.randomUUID();

  await db
    .insertInto("sessions",)
    .values({
      id: sessionId,
      user_id: userId,
      // Same shape as a real login row (src/routes/auth/session.ts): the
      // session id IS the identity, the secret is derived from it.
      secret_hash: `jwt:${sessionId}`,
      expires_at: new Date(Date.now() + 3_600_000,).toISOString(),
    },)
    .execute();

  const token = await signJwt({
    secret,
    userId,
    role,
    sessionId,
    expiresInSeconds: 3600,
  },);

  return { sessionId, token, csrf: mintCsrfToken(secret, sessionId, {},), };
}
