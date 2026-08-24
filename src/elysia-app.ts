// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Elysia App Builder
 *
 * Creates the Elysia HTTP application. Public routes and migrated
 * route modules are registered first. Everything else falls through
 * to the catch-all handler which delegates to the existing dispatch
 * logic (handleApiRequest, static files).
 *
 * Uses closure injection (not .state()/.decorate()) to avoid Elysia's
 * complex type inference issues when merging plugins.
 */
import { Elysia, } from "elysia";
import { BunAdapter, } from "elysia/adapter/bun";
import { registerPlugins, } from "./app/register-plugins";
import type { Config, } from "./config/schema";
import type { Db, } from "./db";
import { authenticate, } from "./middleware/auth";
import { createI18nContext, detectLocale, } from "./middleware/i18n";
import { versionRedirect, } from "./routes/middleware/version-redirect";
import { versionResolver, } from "./routes/middleware/version-resolver";
import { v1Routes, } from "./routes/v1";
import { handleApiRequest, } from "./server";
import { onValidationError, } from "./validation";

/** 302 redirect helper (module scope — no closure capture). */
const redirectTo = (location: string,): Response =>
  new Response(null, { status: 302, headers: { Location: location, }, },);

export interface AppDeps {
  database: Db;
  config: Config;
  handleNonApiRequest: (request: Request,) => Promise<Response>;
}

export function createApp(deps: AppDeps,): Elysia {
  const { database, config, handleNonApiRequest, } = deps;

  const app = new Elysia({ adapter: BunAdapter, },)
    // ── Validation error handler (must be first) ─────────────

    .onError((ctx: any,) => onValidationError(ctx.code, ctx.error, ctx.set,))
    // ── Authentication guard (runs before all routes, populates context) ──────
    .derive(async ({ request, },) => {
      const authResult = await authenticate({ request, database, authConfig: config.auth, },);
      // When auth fails, we still return values (will be null)
      // Route handlers check for userId === null and return 401
      if (authResult instanceof Response) {
        // Still detect locale even when auth fails
        const locale = detectLocale(request,);
        const i18n = createI18nContext(locale,);
        return { userId: null, userRole: null, sessionId: null, ...i18n, };
      }
      // Detect locale and create translator
      const locale = detectLocale(request,);
      const i18n = createI18nContext(locale,);
      return {
        userId: authResult.context.userId,
        userRole: authResult.context.userRole,
        sessionId: authResult.context.sessionId,
        ...i18n,
      };
    },);

  // ── API version resolver ───────────────────────────────────
  // Populates ctx.apiVersion for every request via global derive().
  // Mounted before plugins so they can read apiVersion from context.
  app.use(versionResolver(),);

  registerPlugins(app as unknown as Elysia<any>, { database, config, },);

  // ── V1 versioned routes ────────────────────────────────────────
  (app as any).use(v1Routes({ database, config, },),);
  // NOTE: unversioned /api/* redirect to /api/v1/* happens in the
  // catch-all below (NOT via Elysia catch-all routes) — registering
  // `all("/api/:resource/*")` here matched /api/v1/* too, causing a
  // double-prefix redirect loop (/api/v1/x → /api/v1/v1/x → 404).

  // ── Asset upload (standalone route) ──────────────────────────
  // WORKAROUND: Elysia 1.4.x body consumption bug. When a child plugin
  // containing routes that call request.json() is .use()d into a parent,
  // Elysia's internal body parser consumes the multipart body stream before
  // the upload handler can call request.formData(). Registering the multipart
  // route directly on the parent app avoids this issue.
  // See: https://github.com/elysiajs/elysia/issues/XXX (if filed)
  app.post("/api/assets", async (ctx: any,) => {
    const userId = ctx.userId as string | null;
    if (!userId) {
      const { unauthorizedResponse, } = await import("./routes/http-utils");
      return unauthorizedResponse();
    }
    if (!config.assets.enabled) {
      const { notFoundResponse, } = await import("./routes/http-utils");
      return notFoundResponse("Asset system is disabled",);
    }
    const { handleUpload, } = await import("./assets/controller");
    return handleUpload({
      request: ctx.request,
      userId,
      database,
      uploadDir: config.assets.uploadDir,
      maxFileSize: config.assets.maxFileSize,
    },);
  },);

  // ── Convenience redirects ─────────────────────────────────────
  // Authenticated users land on the chat; everyone else on the login screen.
  app.get("/", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/login",),);
  app.get("/chat", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/login",),);
  app.get("/register", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/register",),);

  // ── Catch-all: delegate to existing dispatch logic ───────────────────────────
  app.all("/*", async ({ request, },) => {
    const url = new URL(request.url,);

    if (url.pathname.startsWith("/api/",)) {
      // Redirect unversioned /api/{resource} → /api/v1/{resource}.
      // Already-versioned /api/v1/* must NOT be redirected (would
      // double-prefix); they fall through to legacy dispatch below.
      if (!url.pathname.startsWith("/api/v1/",)) {
        return versionRedirect("v1",)({ request, },);
      }
      return handleApiRequest({ request, database, config, },);
    }

    return handleNonApiRequest(request,);
  },);

  return app as unknown as Elysia;
}
