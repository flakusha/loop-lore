/**
 * NSFW moderation event logging.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";

/**
 * Log an NSFW moderation event for audit.
 */
export async function logNsfwEvent(
  database: Kysely<DB>,
  event: {
    userId: string | null;
    actorId?: string;
    chatId?: string;
    action: "blocked" | "allowed" | "warning";
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const log = getLogger().child({ module: "nsfw-gate", },);
    log.info(`NSFW gate: ${event.action} — ${event.reason}`, { event, },);

    const entityType = event.actorId ? "actor" : (event.chatId ? "chat" : null);
    const entityId = event.actorId || event.chatId || null;

    const meta = event.metadata ? jsonStringifyOr(event.metadata,) : "{}";

    await database
      .insertInto("log_entries",)
      .values({
        id: crypto.randomUUID(),
        level: 6, // INFO
        timestamp: Date.now(),
        time: new Date().toISOString(),
        message: `NSFW gate: ${event.action} — ${event.reason}`,
        module: "nsfw-gate",
        user_id: event.userId,
        entity_type: entityType,
        entity_id: entityId,
        action: event.action,
        meta,
      },)
      .execute();
  } catch (error: unknown) {
    try {
      const log = getLogger().child({ module: "nsfw-gate", },);
      log.error("Failed to log NSFW event", error instanceof Error ? error : new Error(String(error,),), { event, },);
    } catch {
      /* logger not initialized */
    }
  }
}
