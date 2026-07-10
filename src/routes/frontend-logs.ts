/**
 * Frontend Log Ingestion Route
 *
 * Accepts batched browser-side log entries and writes them
 * through the server-side logger for production visibility.
 *
 * POST /api/frontend/logs  — accept log batch
 */

import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { getLogger } from "../logger";

interface LogEntry {
  level: string;
  module: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

interface LogBatch {
  entries: LogEntry[];
}

const dispatch: RouteDispatch = async ({ request }) => {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname !== "/api/frontend/logs") return null;
  if (request.method !== "POST")
    return jsonError({ message: "Method not allowed", status: HttpStatus.BadRequest });

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
        break;
      }
    }
  }

  return jsonResponse({ ok: true, ingested: body.entries.length });
};

registerRoute(dispatch);
export { dispatch };
