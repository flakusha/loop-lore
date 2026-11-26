// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tooling report ingest API — POST/GET /api/v1/harness/reports.
 *
 * The HTTP face of the tooling-failure report store (the first HTTP-writable
 * TOOLING-FAILURE store; telemetry events and frontend logs already write
 * over HTTP, and the exec log stays in-process-only). Admin-gated like every
 * other harness surface — the assistant path reports via xd://report_issue,
 * not HTTP, so out-of-process non-admin writers are a later, scoped-token
 * ticket.
 *
 * Status contract: the store's semantic validator answers the AC's explicit
 * 400s (unknown source/category, attempt > max_attempts, negative
 * duration_ms, over-long detail); shape mismatches answer the app-wide 422
 * envelope; a DB failure answers 500 with nothing stored; POST is
 * rate-limited per client IP (telemetry-ingest pattern).
 *
 * GET is instance-scoped by construction: rows are stamped with the server's
 * instance slug on write and every read filters on that same slug — a
 * shared-LOOP_LORE_DB_PATH deployment can never read another instance's
 * reports, and no query parameter widens the scope.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { resolveInstanceSlug, } from "../../config/state-dir";
import type { DB, } from "../../db/schema";
import {
  insertToolingReport,
  listToolingReports,
  REPORT_CATEGORIES,
  REPORT_DETAIL_MAX_CHARS,
  REPORT_FIELD_MAX_CHARS,
  REPORT_SOURCES,
} from "../../harness/reports";
import { getChildLogger, } from "../../logger";
import { requirePermission, } from "../../middleware/permissions";
import { createRateLimiter, type RateLimiter, rateLimitHeaders, } from "../../middleware/rate-limit";
import { asError, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { getClientIp, } from "../auth/shared";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/**
 * Per-IP sliding-window budget for POST /harness/reports — the telemetry
 * ingest budget (src/routes/telemetry.ts). The route is admin-gated, but a
 * leaking admin token must not turn the store into a write amplifier.
 */
const REPORT_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30, } as const;

/** Literal enums for the RESPONSE schema; request bodies stay loose strings
 * so unknown values reach the store's validator and answer 400 (not the
 * app-wide 422 shape-mismatch envelope). */
const ReportSourceSchema = t.Union(REPORT_SOURCES.map((s,) => t.Literal(s,)),);
const ReportCategorySchema = t.Union(REPORT_CATEGORIES.map((c,) => t.Literal(c,)),);

/** The stored row, exactly as {@link ToolingReportRow} shapes it. */
const ToolingReportRowSchema = t.Object({
  id: t.String({ description: "Server-generated report id.", },),
  ts: t.String({ description: "Insertion timestamp (ISO-8601).", },),
  source: ReportSourceSchema,
  category: ReportCategorySchema,
  tool: t.String(),
  attempt: t.Union([t.Integer(), t.Null(),],),
  max_attempts: t.Union([t.Integer(), t.Null(),],),
  detail: t.String(),
  duration_ms: t.Union([t.Integer(), t.Null(),],),
  profile: t.Union([t.String(), t.Null(),],),
  branch: t.Union([t.String(), t.Null(),],),
  git_sha: t.Union([t.String(), t.Null(),],),
  instance_id: t.String({ description: "Instance slug stamped by the server; GET is scoped to it.", },),
  dedupe_key: t.Union([t.String(), t.Null(),],),
  count: t.Integer({ description: "1 on insert; incremented per deduped repeat.", },),
  last_seen: t.Union([t.String(), t.Null(),], { description: "Refreshed per deduped repeat.", },),
},);

const ToolingReportPostResponse = t.Object({
  ok: t.Boolean(),
  deduped: t.Boolean({ description: "True when the report bumped an existing cluster instead of inserting.", },),
  report: ToolingReportRowSchema,
},);

const ToolingReportListResponse = t.Object({
  items: t.Array(ToolingReportRowSchema,),
  total: t.Number({ description: "Unpaginated count for the same filters.", },),
},);

const ToolingReportListQuery = t.Object({
  limit: t.Optional(t.String({ description: "Page size, capped at 200 (harness convention: ?limit + offset).", },),),
  offset: t.Optional(t.String({ description: "Page offset.", },),),
  source: t.Optional(t.String({ maxLength: 32, },),),
  category: t.Optional(t.String({ maxLength: 32, },),),
  tool: t.Optional(t.String({ maxLength: REPORT_FIELD_MAX_CHARS, description: "Exact tool-name filter.", },),),
  dedupe_key: t.Optional(t.String({ maxLength: REPORT_FIELD_MAX_CHARS, description: "Exact cluster-key filter.", },),),
},);

/**
 * Build the tooling-report routes.
 * @param root0 - `{ database, config?, reportRateLimiter?, instanceSlug? }`
 *   (`config` only widens trusted-proxy IP extraction; the limiter and slug
 *   resolver are test seams)
 * @param prefix - mount prefix (default `/api/v1`, same as the harness plugin)
 * @returns the Elysia plugin (self-contained admin guard; the harness plugin
 *   mounts it with `.use`).
 */
export function reportRoutes(
  { database, config, reportRateLimiter, instanceSlug, }: {
    database: Kysely<DB>;
    config?: Config;
    reportRateLimiter?: RateLimiter;
    instanceSlug?: () => string;
  },
  prefix = "/api/v1",
): Elysia {
  const guard = requirePermission("admin.system",);
  const limiter = reportRateLimiter ?? createRateLimiter(REPORT_RATE_LIMIT,);
  // getClientIp only reads config.server?.trustProxy; a missing config
  // (tests) means headers are never trusted — peer IP or "unknown" only.
  const trustConfig = config ?? ({ server: {}, } as Config);
  // One resolver for BOTH paths: the write stamp and the read scope must
  // never disagree about whose instance this is.
  const slug = instanceSlug ?? (() => resolveInstanceSlug(process.env,));
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-reports", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .post(`${prefix}/harness/reports`, async (ctx,) => {
          // Per-IP gate BEFORE the store write: a flood must not grow the
          // table (nor the spool), admin or not.
          const ip = getClientIp(
            ctx.request as Request,
            trustConfig,
            ctx.server?.requestIP(ctx.request as Request,)?.address ?? null,
          );

          const limit = limiter.consume(ip,);
          if (!limit.allowed) {
            return new Response(null, {
              status: HttpStatus.TooManyRequests,
              // Retry-After = seconds until the oldest in-window hit ages out.
              headers: rateLimitHeaders(limit, limit.resetSec,),
            },);
          }

          const body = ctx.body as {
            source: string;
            category: string;
            tool: string;
            detail: string;
            attempt?: number;
            max_attempts?: number;
            duration_ms?: number;
            profile?: string;
            branch?: string;
            git_sha?: string;
            dedupe_key?: string;
          };

          try {
            const result = await insertToolingReport(database, {
              source: body.source,
              category: body.category,
              tool: body.tool,
              detail: body.detail,
              attempt: body.attempt,
              maxAttempts: body.max_attempts,
              durationMs: body.duration_ms,
              profile: body.profile,
              branch: body.branch,
              gitSha: body.git_sha,
              dedupeKey: body.dedupe_key,
              instanceId: slug(),
            },);

            if (!result.ok) {
              return jsonError({
                message: result.error,
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            return jsonResponse({ ok: true, deduped: result.deduped, report: result.report, },);
          } catch (error) {
            // A DB failure is a server defect and NOTHING was stored (the
            // spool is only ever written after the DB write commits).
            getChildLogger("routes.harness-reports",)?.error(
              "Tooling report store failed",
              asError(error,),
            );

            return jsonError({
              message: "Tooling report could not be stored",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
        }, {
          body: t.Object({
            source: t.String({
              maxLength: 32,
              description: "One of assistant | harness | giwt | check (unknown values answer 400).",
            },),
            category: t.String({
              maxLength: 32,
              description:
                "One of tooling_failure | retry_exhausted | persistent_failure | performance (unknown values answer 400).",
            },),
            tool: t.String({ maxLength: REPORT_FIELD_MAX_CHARS, description: "The tool or command that failed.", },),
            detail: t.String({
              description: `Failure summary, capped at ${REPORT_DETAIL_MAX_CHARS} characters (over-long answers 400).`,
            },),
            attempt: t.Optional(
              t.Integer({ description: "Retry number that failed (attempt > max_attempts answers 400).", },),
            ),
            max_attempts: t.Optional(t.Integer({ description: "Retry budget for the operation.", },),),
            duration_ms: t.Optional(t.Integer({ description: "Operation duration in ms (negative answers 400).", },),),
            profile: t.Optional(t.String({ maxLength: REPORT_FIELD_MAX_CHARS, },),),
            branch: t.Optional(t.String({ maxLength: REPORT_FIELD_MAX_CHARS, },),),
            git_sha: t.Optional(t.String({ maxLength: REPORT_FIELD_MAX_CHARS, },),),
            dedupe_key: t.Optional(t.String({
              maxLength: REPORT_FIELD_MAX_CHARS,
              description: "Cluster key: a repeat bumps count/last_seen on the existing row instead of inserting.",
            },),),
          },),
          response: {
            200: ToolingReportPostResponse,
            400: ErrorResponse,
            ...denied,
            429: ErrorResponse,
            500: ErrorResponse,
          },
          detail: {
            summary: "Store a tooling failure report",
            description:
              "Ingest one categorized tooling-failure report (assistant | harness | giwt | check). Keyed reports dedupe: a repeat dedupe_key bumps count and refreshes last_seen instead of inserting. Admin only; rate limited per client IP.",
            tags: ["Harness",],
          },
        },)
        .get(`${prefix}/harness/reports`, async (ctx,) => {
          const q = ctx.query as Record<string, string | undefined>;
          const limit = Number.parseInt(q.limit ?? "", 10,);
          const offset = Number.parseInt(q.offset ?? "", 10,);
          try {
            const page = await listToolingReports(database, {
              // Always this server's instance: rows are stamped with the
              // same slug on write, so a caller can only ever see its own
              // instance's reports.
              instanceId: slug(),
              source: q.source,
              category: q.category,
              tool: q.tool,
              dedupeKey: q.dedupe_key,
              limit: Number.isFinite(limit,) ? limit : undefined,
              offset: Number.isFinite(offset,) ? offset : undefined,
            },);

            return jsonResponse({ items: page.items, total: page.total, },);
          } catch (error) {
            getChildLogger("routes.harness-reports",)?.error(
              "Tooling report list failed",
              asError(error,),
            );

            return jsonError({
              message: "Tooling reports could not be read",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
        }, {
          query: ToolingReportListQuery,
          response: { 200: ToolingReportListResponse, ...denied, 500: ErrorResponse, },
          detail: {
            summary: "List tooling failure reports",
            description:
              "List this instance's tooling-failure reports, newest first. Filters: source, category, tool, dedupe_key; `?limit` is capped at 200. Cross-instance reads are impossible by construction.",
            tags: ["Harness",],
          },
        },),);
}
