// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend Log Ingestion Route
 *
 * Accepts batched browser-side log entries and writes them
 * through the server-side logger for production visibility.
 *
 * POST /api/frontend/logs  — accept log batch
 *
 * Note: The incoming log entry shape uses `level: string`
 * ("trace"/"debug"/"info"/"warn"/"error"/"fatal") from the browser. This differs from the
 * internal LogEntry type (`level: number` 5/10/20/30/40/50).
 * The switch below maps string level → BE logger method at the boundary.
 *
 * Elysia plugin — public route (no auth).
 */

import { Elysia, t, } from "elysia";
import type { Config, } from "../config/schema";
import { getLogger, } from "../logger";
import { createRateLimiter, type RateLimiter, rateLimitHeaders, } from "../middleware/rate-limit";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { getClientIp, } from "./auth/shared";
import { HttpStatus, jsonResponse, } from "./http-utils";

/** Bounded batch: one browser flush cannot flood the log pipeline. */
export const MAX_FRONTEND_LOG_ENTRIES = 20;
/** Per-IP budget, identical to the telemetry event sink. */
const LOG_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30, } as const;

const LogBatchSchema = t.Object({
  entries: t.Array(
    t.Object({
      level: t.String({ maxLength: 32, },),
      module: t.String({ maxLength: 200, },),
      message: t.String({ maxLength: 4000, },),
      meta: t.Optional(t.Record(t.String(), t.Unknown(),),),
      timestamp: t.Optional(t.String({ maxLength: 64, },),),
    },),
    { minItems: 1, maxItems: MAX_FRONTEND_LOG_ENTRIES, },
  ),
},);

interface FrontendLogsOpts {
  /** Server config for trusted-proxy IP resolution (tests omit it). */
  config?: Config;
  /** Per-mount limiter seam so test files never share a bucket. */
  logRateLimiter?: RateLimiter;
}

/**
 * @param prefix
 * @param opts - rate-limiter / trusted-proxy seams (per-mount in tests)
 * @returns the frontend-log ingestion plugin
 */
export function frontendLogsRoutes(prefix = "/api", opts: FrontendLogsOpts = {},) {
  // Per-mount limiter (same seam as telemetryRoutes) so parallel tests never
  // share a bucket; production mounts this plugin exactly once.
  const limiter = opts.logRateLimiter ?? createRateLimiter(LOG_RATE_LIMIT,);
  const trustConfig = opts.config ?? ({ server: {}, } as Config);

  return new Elysia({ name: "frontend-logs", },)
    // Keep the sink original 400 contract for malformed batches (Elysia defaults to 422).
    .onError(({ code, set, },) => {
      if (code === "VALIDATION" || code === "PARSE") {
        set.status = HttpStatus.BadRequest;
        return { error: "Invalid frontend log batch", code: "BAD_REQUEST", };
      }
    },)
    .post(`${prefix}/frontend/logs`, async ({ body, request, server, },) => {
      const ip = getClientIp(request, trustConfig, server?.requestIP(request,)?.address ?? null,);
      const limit = limiter.consume(ip,);
      if (!limit.allowed) {
        return new Response(null, {
          status: HttpStatus.TooManyRequests,
          headers: rateLimitHeaders(limit, limit.resetSec,),
        },);
      }

      const log = getLogger();
      for (const entry of body.entries) {
        const meta: Record<string, unknown> = { ...entry.meta, _source: "browser", _module: entry.module, };
        const msg = `[FE] ${entry.message}`;

        switch (entry.level) {
          case "trace": {
            log.trace(msg, meta,);
            break;
          }

          case "debug": {
            log.debug(msg, meta,);
            break;
          }

          case "info": {
            log.info(msg, meta,);
            break;
          }

          case "warn": {
            log.warn(msg, meta,);
            break;
          }

          case "error": {
            log.error(msg, undefined, meta,);
            break;
          }

          case "fatal": {
            log.fatal(msg, undefined, meta,);
            break;
          }

          default: {
            log.info(msg, meta,);
          }
        }
      }

      return jsonResponse({ ok: true, ingested: body.entries.length, },);
    }, {
      body: LogBatchSchema,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        429: ErrorResponse,
      },
      detail: {
        summary: "Ingest frontend logs",
        description:
          "Accept a bounded batch of browser-side log entries and write them through the server-side logger for production visibility.",
        tags: ["Logs",],
      },
    },);
}
