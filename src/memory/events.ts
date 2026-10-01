// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory event stream — quest lifecycle events surfaced through the
 * telemetry events sink (`telemetry_events`), the generic event store
 * (same fire-and-forget pattern as autonomy's `emitSchedulerEvent`).
 *
 * Emission is best-effort: failures are logged, never thrown, and never
 * block the quest transition that produced the event. Rows land only when
 * the telemetry events sink is enabled (`TELEMETRY_EVENTS_ENABLED`, dev
 * default outside production).
 *
 * TASK-chat-feature-notes-shadow-carriage AC5: quest state transitions
 * (open / completed / failed) emit memory events.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { record, } from "../telemetry/service";

/** Emitted when a quest is created (opens in its initial status). */
export const MEMORY_EVENT_QUEST_OPENED = "memory.quest.opened";

/** Emitted when progress reaches the target and the quest completes. */
export const MEMORY_EVENT_QUEST_COMPLETED = "memory.quest.completed";

/** Dotted memory-stream event names (`memory.*`). */
export type MemoryEventType = `memory.${string}`;

/** Structured JSON-serialisable memory-event payload. */
export type MemoryEventPayload = Record<string, unknown>;

/**
 * Emit a memory event, swallowing failures.
 * @param db
 * @param eventType - dotted event name (e.g. `memory.quest.failed`)
 * @param data - structured JSON-serialisable payload
 * @returns {void}
 */
export function emitMemoryEvent(
  db: Kysely<DB>,
  eventType: MemoryEventType,
  data: MemoryEventPayload,
): void {
  record(db, { eventType, data, },).catch((err: unknown,) => {
    const log = getLogger().child({ module: "memory.events", },);
    log.warn("Memory event dropped", { eventType, reason: String(err,), },);
  },);
}
