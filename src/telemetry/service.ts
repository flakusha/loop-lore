/**
 * Telemetry Service
 *
 * Opt-in anonymized event recording. No content — metadata only.
 *   generation.started/completed/failed
 *   tool.called/failed
 *   frontend.page_view/click/error
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { getLogger } from "../logger";
import { safeJsonStringify } from "../utils";
import { loadTelemetryConfig } from "./config";

const config = loadTelemetryConfig();

type EventData = Record<string, unknown>;
interface EventParams {
  eventType: string;
  sessionId?: string;
  userId?: string;
  chatId?: string;
  data?: EventData;
}

export async function record(
  db: Kysely<DB>,
  { eventType, sessionId, userId, chatId, data }: EventParams,
): Promise<void> {
  if (!config.eventsEnabled) return;

  const payload = (() => {
    const r = safeJsonStringify(data ?? {});
    return r.ok ? r.value : "{}";
  })();

  try {
    await db
      .insertInto("telemetry_events")
      .values({
        id: crypto.randomUUID(),
        event_type: eventType,
        session_id: sessionId ?? null,
        user_id: userId ?? null,
        chat_id: chatId ?? null,
        event_data: payload,
        created_at: new Date().toISOString(),
      })
      .execute();
  } catch (error: unknown) {
    getLogger()
      .child({ module: "telemetry" })
      .warn("Failed to record telemetry event", { error: String(error) });
  }
}

export function isTelemetryEnabled(): boolean {
  return config.eventsEnabled;
}

export function isFrontendTelemetryEnabled(): boolean {
  return config.frontendEnabled;
}

export function getRetentionDays(): number {
  return config.retentionDays;
}
