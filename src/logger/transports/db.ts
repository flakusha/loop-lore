/**
 * DBTransport — Writes structured log entries to the log_entries table.
 *
 * Enables audit trail queries from admin panel.
 * Catches all errors silently — logging must never crash the app.
 *
 * @module logger-transports-db
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import type { LogEntry, Transport, } from "../types";

export class DBTransport implements Transport {
  readonly name = "db";

  private readonly db: Kysely<DB>;

  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  async write(entry: LogEntry,): Promise<void> {
    try {
      const metaStr = entry.meta && Object.keys(entry.meta,).length > 0 ? jsonStringifyOr(entry.meta,) : null;

      const msgStr = typeof entry.message === "string" ? entry.message : jsonStringifyOr(entry.message,);

      const eventType = (entry.meta?.event_type as string | undefined) ?? null;
      const entityType = (entry.meta?.entity_type as string | undefined) ?? null;
      const entityId = (entry.meta?.entity_id as string | undefined) ?? null;
      const action = (entry.meta?.action as string | undefined) ??
        (typeof entry.message === "string" ? entry.message : undefined) ??
        null;

      await this.db
        .insertInto("log_entries",)
        .values({
          id: crypto.randomUUID(),
          level: entry.level,
          timestamp: entry.timestamp,
          time: entry.time,
          message: msgStr,
          module: entry.module ?? null,
          user_id: entry.userId ?? null,
          session_id: entry.sessionId ?? null,
          request_id: entry.requestId ?? null,
          meta: metaStr,
          event_type: eventType,
          entity_type: entityType,
          entity_id: entityId,
          action,
        },)
        .execute();
    } catch {
      // Silently ignore — logging must not crash the app
    }
  }

  async flush(): Promise<void> {
    // No buffering — writes are atomic INSERTs
  }
}
