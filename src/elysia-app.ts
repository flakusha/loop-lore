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
import { createAsyncStore, startOffloadDaemon, } from "./async";
import type { Config, } from "./config/schema";
import type { Db, } from "./db";
import { authenticate, } from "./middleware/auth";
import {
  cookieForDecision,
  CSRF_EXEMPT_ROUTES,
  CSRF_HEADER,
  decideCsrf,
} from "./middleware/csrf";
import type { CsrfMiddlewareOptions, } from "./middleware/csrf";
import { createI18nContext, detectLocale, } from "./middleware/i18n";
import { idempotent, } from "./middleware/idempotency";
import type { IdempotencyCtx, } from "./middleware/idempotency";
import { requestIdMiddleware, } from "./middleware/request-id";
import { safeJsonStringify, } from "./utils/safe-json";

import { recordLifecycle, } from "./middleware/lifecycle";
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

  // Wire the async request-result store + offload daemon once at boot.
  // The status endpoint, idempotency replay, and `triggerAutoGeneration`
  // all read/write the same `request_results` table.
  const asyncStore = createAsyncStore(database,);
  const offloadDaemon = startOffloadDaemon(database, asyncStore.config,);
  offloadDaemon.start();

  const app = new Elysia({ adapter: BunAdapter, },)
    // ── Validation error handler (must be first) ─────────────

    .onError((ctx: any,) => onValidationError(ctx.code, ctx.error, ctx.set,))
    // ── Request-id resolution ────────────────────────────────
    // Resolves, validates, and applies the request id BEFORE auth so
    // authenticate(...) can correlate it. Sets x-request-id on the request
    // headers (existing header reads keep working) and populates ctx.requestId.
    .derive(requestIdMiddleware(),)
    // ── Authentication guard (runs before all routes, populates context) ──────
    .derive(async ({ request, },) => {
      const authResult = await authenticate({ request, database, authConfig: config.auth, },);
      // When auth fails, we still return values (will be null)
      // Route handlers check for userId === null and return 401
      if (authResult instanceof Response) {
        // Still detect locale even when auth fails
        const locale = detectLocale(request,);
        const i18n = createI18nContext(locale,);
        // Unauthenticated: drop any client-supplied x-user-id so it cannot
        // spoof the user attributed in the access log (handler reads it).
        request.headers.delete("x-user-id",);
        return { userId: null, userRole: null, sessionId: null, ...i18n, };
      }
      // Detect locale and create translator
      const locale = detectLocale(request,);
      const i18n = createI18nContext(locale,);
      // Propagate the resolved user id onto the request so the access-log
      // handler (src/server/handler.ts) can attribute the request via the
      // x-user-id header. This is the same Request object the handler clones
      // and later reads, so the mutation is observed downstream. Skip when
      // unauthenticated — the header type is non-nullable and the access-log
      // falls back to anonymous attribution for absent x-user-id.
      if (authResult.context.userId !== null) {
        request.headers.set("x-user-id", authResult.context.userId,);
      }
      return {
        userId: authResult.context.userId,
        userRole: authResult.context.userRole,
        sessionId: authResult.context.sessionId,
        ...i18n,
      };
    },);

  // ── CSRF protection (double-submit cookie via Bun.CSRF) ───────
  // Runs after auth derive so sessionId is available for token binding,
  // and BEFORE idempotency.onBeforeHandle so unsafe idempotent requests
  // are rejected at the gate (and never reach recordResponse / cache).
  const csrfSecret = config.auth.csrfSecret ?? "";
  const fallbackSecret = config.auth.jwtSecret ?? "";
  const csrfEnabled = csrfSecret.length > 0 || fallbackSecret.length > 0;
  const effectiveCsrfSecret = csrfSecret.length > 0 ? csrfSecret : fallbackSecret;
  const csrfOpts: CsrfMiddlewareOptions = {
    secret: effectiveCsrfSecret,
    enabled: csrfEnabled,
  };
  // Elysia infers context types from prior `derive(...)` calls; we match the
  // existing onBeforeHandle/onAfterHandle convention used by the idempotency
  // middleware — explicit `any` with structural usage. Type-safe at runtime;
  // the helpers above consume only the well-known fields.
  app.onBeforeHandle((ctx: any,) => {
    if (!csrfEnabled) { return undefined; }
    const decision = decideCsrf(csrfOpts, {
      method: ctx.request.method,
      routePattern: ctx.route ?? null,
      headers: ctx.request.headers,
      sessionId: ctx.sessionId ?? null,
      requestId: ctx.requestId ?? "anon",
    },);
    if (!decision.ok) {
      ctx.set.status = 403;
      const body = safeJsonStringify({
        error: "csrf_verification_failed",
        message: "CSRF token missing or invalid.",
      },);
      const payload = body.ok ? body.value : '{"error":"csrf_verification_failed"}';
      return new Response(payload, {
        status: 403,
        headers: { "content-type": "application/json", },
      },);
    }
    return undefined;
  },);
  app.onAfterHandle((ctx: any,) => {
    if (!csrfEnabled) { return; }
    const decision = decideCsrf(csrfOpts, {
      method: ctx.request.method,
      routePattern: ctx.route ?? null,
      headers: ctx.request.headers,
      sessionId: ctx.sessionId ?? null,
      requestId: ctx.requestId ?? "anon",
    },);
    const cookieHeader = cookieForDecision(decision, csrfOpts,);
    if (cookieHeader === null) { return; }
    // Elysia mutation point — `ctx.set.headers` is an HTTPHeaders map; we
    // append the Set-Cookie so the browser picks up the freshly-minted
    // token on the next request.
    ctx.set.headers.append("set-cookie", cookieHeader,);
  },);
  // Reference CSRF_HEADER + CSRF_EXEMPT_ROUTES so tree-shakers keep the
  // route-table constant when consumers spread the module. The middleware
  // looks the routes up internally via the Set; these symbols are the
  // canonical "what we protect" surface for plugin authors.
  void CSRF_HEADER;
  void CSRF_EXEMPT_ROUTES;

  // ── Idempotency guard (after request-id derive so ctx.requestId is populated)
  // Single shared instance so beforeHandle (markInFlight) and recordResponse
  // (cache write) operate on the same in-memory cache.
  const idem = idempotent({
    backend: config.idempotency.backend,
    ttlMs: config.idempotency.ttlMs,
    asyncStore: config.idempotency.backend === "table" ? asyncStore : undefined,
    enabled: config.idempotency.enabled,
    bypassHeader: config.idempotency.bypassHeader,
  },);

  app.onBeforeHandle(async (ctx: IdempotencyCtx,) => idem.beforeHandle(ctx,));

  app.onAfterHandle(async (ctx: IdempotencyCtx & { response?: unknown; set: { status?: number | string } },) => {
    const requestId = ctx.requestId;
    if (!requestId) { return; }
    const response = ctx.response;
    // Cache only successful Response objects (2xx/3xx). Everything else
    // releases the in-flight slot so the client can retry.
    if (!(response instanceof Response) || response.status >= 300) {
      idem.release({ method: ctx.request.method, route: ctx.route ?? "?", requestId, },);
      return;
    }
    idem.recordResponse({
      method: ctx.request.method,
      route: ctx.route ?? "?",
      requestId,
      response,
    },);
  },);

  // ── Request lifecycle (complete/fail the result row)
  // Runs AFTER the idempotency afterHandle so it sees the recorded response.
  app.onAfterHandle(recordLifecycle(asyncStore,),);

  // ── Error boundary: mark tracked requests as failed
  // Uncaught throws in handlers still resolve ctx.requestId (derive ran),
  // so we can flip the result row to "failed" instead of leaving it pending.
  app.onError((ctx: IdempotencyCtx & { error: unknown },) => {
    const requestId = ctx.requestId;
    if (requestId) { asyncStore.fail(requestId, String(ctx.error,),); }
  },);

  // ── Graceful shutdown: flush pending async-store writes
  app.onStop(() => {
    void asyncStore.flush();
  },);
  // ── API version resolver ───────────────────────────────────
  // Populates ctx.apiVersion for every request via global derive().
  // Mounted before plugins so they can read apiVersion from context.
  app.use(versionResolver(),);

  registerPlugins(app as unknown as Elysia<any>, { database, config, asyncStore, },);

  (app as any).use(v1Routes({ database, config, asyncStore, },),);
  // `all("/api/:resource/*")` here matched /api/v1/* too, causing a
  // double-prefix redirect loop (/api/v1/x → /api/v1/v1/x → 404).

  // ── Multipart upload route — registered directly on the parent app with
  // parse: "none" so Elysia's body inference (which other sub-plugins force
  // across the composed app) does not consume the multipart stream before
  // handleUpload calls request.formData().
  app.post(
    "/api/assets",
    async (ctx: any,) => {
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
    },
    { parse: "none", },
  );

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
