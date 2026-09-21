// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 350

/**
 * Admin AUX Telemetry Endpoint
 *
 * GET /api/admin/telemetry/aux — recent AUX pipeline call events.
 * Returns the last N aux.call events with optional aggregation by task.
 *
 * Privacy posture (BUG-admin-auxtelemetry-leaks-userid-chatid):
 *   - `userId` and `chatId` are HMAC-derived 16-hex hashes (domain
 *     TELEMETRY_PII), not raw identifiers. Same input → same hash,
 *     enabling cross-event correlation without exposing the actor.
 *   - Raw `error` strings are replaced with an `errorCategory` enum
 *     (timeout | rate_limit | schema_validation | auth_failure | other).
 *     Provider error text frequently echoes prompt fragments or model
 *     identifiers that map back to user behavior.
 *   - Default `?since=24h`, max 7d lookback (rejects longer windows).
 *   - `MAX_LIMIT=100` (down from 500) bounds response size.
 *   - `?aggregate_only=true` returns just rollups, no per-row events.
 */
import { Elysia, t, } from "elysia";
import { resolveTelemetryPiiSecret as resolveSharedTelemetryPiiSecret, } from "../../config/load/pii-safety";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import { parseExpiryMs, } from "../../utils/date";
import { DOMAIN_INFO, domainKey, } from "../../utils/hkdf";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

interface AuxTelemetryRow {
  id: string;
  task: string;
  model: string | null;
  provider: string | null;
  latencyMs: number;
  success: boolean;
  promptTokens: number;
  completionTokens: number;
  errorCategory: "timeout" | "rate_limit" | "schema_validation" | "auth_failure" | "other" | null;
  chatHash: string | null;
  userHash: string | null;
  createdAt: string;
}

interface TaskAggregate {
  task: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;
const MAX_SINCE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Server-side HMAC secret for telemetry PII hashing, resolved lazily on
 * first use — never at import. Route modules load before `loadConfig()`
 * merges `configs/env.yaml`, so an import-time read would miss
 * file-provided values and crash production boots that are configured.
 * Merged Config wins, raw `TELEMETRY_PII_SECRET` env is the fallback.
 * @param configured Value from the merged Config (`observability.telemetry.piiSecret`).
 */
function effectiveSecret(configured?: string,): string {
  return resolveSharedTelemetryPiiSecret({ piiSecret: configured, },);
}
let cachedSecret: string | null = null;
/** Resolve (and memoize) the secret; test hook below busts the cache. */
function secret(configured?: string,): string {
  if (configured) { return effectiveSecret(configured,); }
  cachedSecret ??= effectiveSecret();
  return cachedSecret;
}
/** Bust the memoized secret + key. Test-only; called when env flips mid-process. */
export function resetTelemetryPiiSecretCache(): void {
  cachedSecret = null;
  hmacKeyPromise = null;
  keySecret = null;
}

let hmacKeyPromise: Promise<CryptoKey> | null = null;
let keySecret: string | null = null;
/** */
async function getHmacKey(configured?: string,): Promise<CryptoKey> {
  const current = secret(configured,);
  if (!hmacKeyPromise || keySecret !== current) {
    const subkey = await domainKey(current, DOMAIN_INFO.TELEMETRY_PII, 32,);
    keySecret = current;
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      subkey as unknown as Uint8Array<ArrayBuffer>,
      { name: "HMAC", hash: "SHA-256", },
      false,
      ["sign",],
    );
  }
  return hmacKeyPromise;
}

/**
 * @param value
 */
async function hashId(value: string, configured?: string,): Promise<string> {
  const key = await getHmacKey(configured,);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value,) as unknown as Uint8Array<ArrayBuffer>,
  );
  return [...new Uint8Array(sig,),]
    .slice(0, 8,)
    .map((b,) => b.toString(16,).padStart(2, "0",))
    .join("",);
}

/**
 * @param opts
 * @param prefix
 */
export function auxTelemetryRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  const telemetrySecret = opts.config?.observability?.telemetry?.piiSecret;

  return new Elysia({ name: "admin-aux-telemetry", },)
    .get(`${prefix}/admin/telemetry/aux`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      if (!can(userRole, "admin.system",)) {
        return jsonError({
          message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      const aggregateOnly = ctx.query?.aggregate_only === true || ctx.query?.aggregate_only === "true";
      const limit = Math.min(
        Math.max(Number(ctx.query?.limit,) || DEFAULT_LIMIT, 1,),
        MAX_LIMIT,
      );
      const task = typeof ctx.query?.task === "string" ? ctx.query.task : undefined;

      const sinceParam = typeof ctx.query?.since === "string" ? ctx.query.since : undefined;
      let sinceMsParsed: number | null = null;
      if (sinceParam) {
        if (/^\d+$/.test(sinceParam,)) {
          const n = Number(sinceParam,);
          sinceMsParsed = Number.isFinite(n,) ? n : null;
        } else {
          const t = parseExpiryMs(sinceParam,);
          sinceMsParsed = t;
        }
        if (sinceMsParsed === null) {
          return jsonError({
            message: ctx.t?.("admin.invalidSince",) ?? "Invalid `since` parameter",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
        if (Date.now() - sinceMsParsed > MAX_SINCE_MS) {
          return jsonError({
            message: ctx.t?.("admin.sinceWindowTooLarge",) ?? "`since` window exceeds 7d",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
      }
      const sinceMs = sinceMsParsed ?? (Date.now() - DEFAULT_SINCE_MS);
      const sinceIso = new Date(sinceMs,).toISOString();

      const rows = await db
        .selectFrom("telemetry_events",)
        .select(["id", "event_data", "chat_id", "user_id", "created_at",],)
        .where("event_type", "=", "aux.call",)
        .where("created_at", ">=", sinceIso,)
        .orderBy("created_at", "desc",)
        // In aggregate-only mode we still need rows for the rollup.
        .limit(aggregateOnly ? MAX_LIMIT : limit,)
        .execute();

      const userIds = new Set<string>();
      const chatIds = new Set<string>();
      for (const row of rows) {
        if (row.user_id) { userIds.add(row.user_id,); }
        if (row.chat_id) { chatIds.add(row.chat_id,); }
      }
      const userHashMap = new Map<string, string>();
      const chatHashMap = new Map<string, string>();
      await Promise.allSettled([
        ...[...userIds,].map(async (id,) => {
          userHashMap.set(id, await hashId(id, telemetrySecret,),);
        },),
        ...[...chatIds,].map(async (id,) => {
          chatHashMap.set(id, await hashId(id, telemetrySecret,),);
        },),
      ],);

      const events: AuxTelemetryRow[] = [];
      for (const row of rows) {
        const data = jsonParseOr<Record<string, unknown>>(row.event_data, {},);
        if (!data || typeof data !== "object") { continue; }

        const rowTask = typeof data.task === "string" ? data.task : "";
        if (task && rowTask !== task) { continue; }

        events.push({
          id: row.id,
          task: rowTask,
          model: typeof data.model === "string" ? data.model : null,
          provider: typeof data.provider === "string" ? data.provider : null,
          latencyMs: Number(data.latencyMs,) || 0,
          success: Boolean(data.success,),
          promptTokens: Number(data.promptTokens,) || 0,
          completionTokens: Number(data.completionTokens,) || 0,
          errorCategory: classifyError(data.error,),
          userHash: row.user_id ? userHashMap.get(row.user_id,) ?? null : null,
          chatHash: row.chat_id ? chatHashMap.get(row.chat_id,) ?? null : null,
          createdAt: row.created_at,
        },);
      }

      const taskMap = new Map<string, TaskAggregate>();
      for (const ev of events) {
        let agg = taskMap.get(ev.task,);
        if (!agg) {
          agg = {
            task: ev.task,
            totalCalls: 0,
            successCount: 0,
            failureCount: 0,
            avgLatencyMs: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
          };
          taskMap.set(ev.task, agg,);
        }
        agg.totalCalls++;
        if (ev.success) { agg.successCount++; }
        else { agg.failureCount++; }
        agg.totalPromptTokens += ev.promptTokens;
        agg.totalCompletionTokens += ev.completionTokens;
      }
      const taskTotals = new Map<string, { sum: number; count: number }>();
      for (const ev of events) {
        const totals = taskTotals.get(ev.task,) ?? { sum: 0, count: 0, };
        totals.sum += ev.latencyMs;
        totals.count++;
        taskTotals.set(ev.task, totals,);
      }
      for (const [taskName, agg,] of taskMap) {
        const totals = taskTotals.get(taskName,);
        agg.avgLatencyMs = totals ? Math.round(totals.sum / totals.count,) : 0;
      }

      return jsonResponse({
        events: aggregateOnly ? [] : events,
        aggregates: Array.from(taskMap.values(),),
        total: events.length,
        sinceIso,
        untilIso: new Date().toISOString(),
      },);
    }, {
      query: t.Object({
        limit: t.Optional(t.Union([t.Number(), t.String(),],),),
        task: t.Optional(t.String(),),
        since: t.Optional(t.String(),),
        aggregate_only: t.Optional(t.Union([t.Boolean(), t.String(),],),),
      },),
      response: {
        200: t.Object({
          events: t.Array(t.Object({
            id: t.String(),
            task: t.String(),
            model: t.Union([t.String(), t.Null(),],),
            provider: t.Union([t.String(), t.Null(),],),
            latencyMs: t.Number(),
            success: t.Boolean(),
            promptTokens: t.Number(),
            completionTokens: t.Number(),
            errorCategory: t.Union([
              t.Literal("timeout",),
              t.Literal("rate_limit",),
              t.Literal("schema_validation",),
              t.Literal("auth_failure",),
              t.Literal("other",),
              t.Null(),
            ],),
            userHash: t.Union([t.String(), t.Null(),],),
            chatHash: t.Union([t.String(), t.Null(),],),
            createdAt: t.String(),
          },),),
          aggregates: t.Array(t.Object({
            task: t.String(),
            totalCalls: t.Number(),
            successCount: t.Number(),
            failureCount: t.Number(),
            avgLatencyMs: t.Number(),
            totalPromptTokens: t.Number(),
            totalCompletionTokens: t.Number(),
          },),),
          total: t.Number(),
          sinceIso: t.String(),
          untilIso: t.String(),
        },),
        400: ErrorResponse,
        403: ErrorResponse,
      },
    },);
}

/**
 * @param raw
 */
function classifyError(raw: unknown,): "timeout" | "rate_limit" | "schema_validation" | "auth_failure" | "other" {
  if (typeof raw !== "string" || raw.length === 0) { return "other"; }
  const lower = raw.toLowerCase();
  if (lower.includes("timeout",) || lower.includes("etimedout",) || lower.includes("aborted",)) {
    return "timeout";
  }
  if (lower.includes("rate limit",) || lower.includes("429",) || lower.includes("too many requests",)) {
    return "rate_limit";
  }
  if (
    lower.includes("json",) || lower.includes("schema",) || lower.includes("parse",) ||
    lower.includes("invalid_request",)
  ) {
    return "schema_validation";
  }
  if (
    lower.includes("auth",) || lower.includes("unauthorized",) || lower.includes("401",) || lower.includes("403",) ||
    lower.includes("api key",)
  ) {
    return "auth_failure";
  }
  return "other";
}
