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

export { resetLoginRateLimiter, resetRegisterRateLimiter, } from "./shared";

// ── Public routes: auth runs but won't block ─────────────────

export function authPublicRoutes({ database, config, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "auth-public", },)
    .post(
      `${prefix}/auth/login`,
      async ({ request, ...rest },) =>
        handleLogin(request, database, config, (rest as any).t as TranslatorFn | undefined,),
      {
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
      async ({ request, ...rest },) =>
        handleDemoLogin(request, database, config, (rest as any).t as TranslatorFn | undefined,),
      {
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
      async ({ request, ...rest },) =>
        handleRegister(request, database, config, (rest as any).t as TranslatorFn | undefined,),
      {
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

export function authProtectedRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",): Elysia {
  return new Elysia({ name: "auth-protected", },)
    .post(
      `${prefix}/auth/logout`,
      async ({ request, },) => handleLogout(request, database,),
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
      async ({ request, ...rest },) => handleMe(request, database, (rest as any).userId as string | null | undefined,),
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
