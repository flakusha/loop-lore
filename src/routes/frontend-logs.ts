/**
 * Frontend Log Ingestion Route
 *
 * Accepts batched browser-side log entries and writes them
 * through the server-side logger for production visibility.
 *
 * POST /api/frontend/logs  — accept log batch
 *
 * Note: The incoming log entry shape uses `level: string` ("debug"/"info"/"warn"/"error")
 * from the browser. This differs from the internal LogEntry type (`level: number` 10/20/30/40).
 * The switch below maps string level → BE logger method at the boundary.
 *
 * Elysia plugin — public route (no auth).
 */

import { Elysia } from "elysia";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { getLogger } from "../logger";

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

export function frontendLogsRoutes() {
  return new Elysia({ name: "frontend-logs" }).post("/api/frontend/logs", async ({ request }) => {
    let body: LogBatch;
    try {
      body = (await request.json()) as LogBatch;
    } catch {
      return jsonError({ message: "Invalid JSON body", status: HttpStatus.BadRequest });
    }

    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return jsonError({ message: "entries must be a non-empty array", status: HttpStatus.BadRequest });
    }

    const log = getLogger();

    for (const entry of body.entries) {
      const meta: Record<string, unknown> = { ...entry.meta, _source: "browser", _module: entry.module };
      const msg = `[FE] ${entry.message}`;

      switch (entry.level) {
        case "debug": {
          log.debug(msg, meta);
          break;
        }
        case "info": {
          log.info(msg, meta);
          break;
        }
        case "warn": {
          log.warn(msg, meta);
          break;
        }
        case "error": {
          log.error(msg, undefined, meta);
          break;
        }
        default: {
          log.info(msg, meta);
        }
      }
    }

    return jsonResponse({ ok: true, ingested: body.entries.length });
  });
}
