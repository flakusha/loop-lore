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

import { Elysia, } from "elysia";
import { getLogger, } from "../logger";
import { SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

interface FrontendLogEntry {
  level: string;
  module: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

interface LogBatch {
  entries: FrontendLogEntry[];
}

export function frontendLogsRoutes(prefix = "/api",) {
  return new Elysia({ name: "frontend-logs", },).post(`${prefix}/frontend/logs`, async ({ request, ...rest },) => {
    let body: LogBatch;
    try {
      body = (await request.json()) as LogBatch;
    } catch {
      return jsonError({
        message: (rest as any).t?.("errors.badRequest",) ?? "Invalid JSON body",
        status: HttpStatus.BadRequest,
      },);
    }

    if (!Array.isArray(body.entries,) || body.entries.length === 0) {
      return jsonError({
        message: (rest as any).t?.("frontendLogs.entriesRequired",) ?? "entries must be a non-empty array",
        status: HttpStatus.BadRequest,
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
    response: {
      200: SuccessResponse,
    },
    detail: {
      summary: "Ingest frontend logs",
      description:
        "Accept a batch of browser-side log entries and write them through the server-side logger for production visibility.",
      tags: ["Logs",],
    },
  },);
}
