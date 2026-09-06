// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth Routes
 *
 *   POST /api/auth/login      — authenticate, create session, return JWT
 *   POST /api/demo-login      — solo/demo mode login (no password)
 *   POST /api/auth/register   — create account + auto-login
 *   POST /api/auth/logout     — revoke session, clear cookie
 *   GET  /api/auth/me         — current user profile
 *
 * Login form submits form-encoded. On success: HX-Redirect + Set-Cookie.
 * On failure: error HTML for htmx error swap.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { handleDemoLogin, handleLogin, } from "./login";
import { handleRegister, } from "./register";
import { handleLogout, handleMe, } from "./session";
import type { HandleOpts, } from "./types";

export {
  createDemoLoginLimiter,
  createLoginLimiter,
  createRegisterLimiter,
  resetDemoLoginRateLimiter,
  resetLoginRateLimiter,
  resetRegisterRateLimiter,
} from "./shared";

// ── Public routes: auth runs but won't block ─────────────────

/**
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param root0.limiters
 * @param prefix
 */
export function authPublicRoutes({ database, config, limiters, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "auth-public", },)
    .post(
      `${prefix}/auth/login`,
      async ({ request, server, ...rest },) =>
        handleLogin(
          request,
          database,
          config,
          (rest as any).t as TranslatorFn | undefined,
          server?.requestIP(request,)?.address ?? null,
          limiters?.loginLimiter,
        ),
      {
        // Form-encoded POST; Request-first handlers trigger sucrose
        // JSON-body inference which rejects form submissions (415/400).
        // Disable body parsing — handler uses parseCredentials(request).
        parse: "none",
        response: {
          200: SuccessResponse,
        },
        detail: {
          summary: "Login",
          description: "Authenticate with username/password, create session, return JWT in cookie.",
          tags: ["Auth",],
        },
      },
    )
    .post(
      `${prefix}/demo-login`,
      async ({ request, server, ...rest },) =>
        handleDemoLogin(
          request,
          database,
          config,
          (rest as any).t as TranslatorFn | undefined,
          server?.requestIP(request,)?.address ?? null,
          limiters?.demoLoginLimiter,
        ),
      {
        parse: "none",
        response: {
          200: SuccessResponse,
        },
        detail: {
          summary: "Demo login",
          description: "Solo/demo mode login — no password required. Creates or reuses the demo user.",
          tags: ["Auth",],
        },
      },
    )
    .post(
      `${prefix}/auth/register`,
      async ({ request, server, ...rest },) =>
        handleRegister(
          request,
          database,
          config,
          (rest as any).t as TranslatorFn | undefined,
          server?.requestIP(request,)?.address ?? null,
          limiters?.registerLimiter,
        ),
      {
        parse: "none",
        response: {
          200: SuccessResponse,
        },
        detail: {
          summary: "Register",
          description: "Create a new account and automatically log in. Rate-limited to 3 attempts per hour.",
          tags: ["Auth",],
        },
      },
    );
}

// ── Protected routes: require auth ───────────────────────────

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function authProtectedRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",): Elysia {
  return new Elysia({ name: "auth-protected", },)
    .post(
      `${prefix}/auth/logout`,
      async ({ request, server, ...rest },) => {
        const userId = "userId" in rest && typeof rest.userId === "string"
          ? rest.userId
          : null;
        const sessionId = "sessionId" in rest && typeof rest.sessionId === "string"
          ? rest.sessionId
          : null;
        return handleLogout(request, database, userId, sessionId,);
      },
      {
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Logout",
          description: "Revoke current session and clear authentication cookie.",
          tags: ["Auth",],
        },
      },
    )
    .get(
      `${prefix}/auth/me`,
      async ({ request, server, ...rest },) => {
        const userId = "userId" in rest && typeof rest.userId === "string"
          ? rest.userId
          : null;
        return handleMe(request, database, userId,);
      },
      {
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Current user",
          description: "Get the authenticated user's profile.",
          tags: ["Auth",],
        },
      },
    );
}
