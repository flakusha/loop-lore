// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/scheduler/telemetry.ts — scheduler event names + emit
//
// Fire-and-forget by design: a telemetry outage must never stall or
// fail the autonomy tick it is describing. Failures are logged, not
// thrown, and never block the dispatch decision.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { record, } from "../../telemetry/service";

/** Emitted before a world dispatches. */
export const EV_STARTED = "scheduler.world_tick.started";

/** Emitted after a world commits its cursor. */
export const EV_COMPLETED = "scheduler.world_tick.completed";

/** Emitted when a world's dispatch throws. */
export const EV_ERROR = "scheduler.world_tick.error";

/**
 * Emit a scheduler event, swallowing failures.
 * @param db
 * @param eventType
 * @param data
 */
export function emitSchedulerEvent(
  db: Kysely<DB>,
  eventType: string,
  data: Record<string, unknown>,
): void {
  record(db, { eventType, data, },).catch((err: unknown,) => {
    getLogger()
      .child({ module: "autonomy.scheduler", },)
      .warn("Failed to emit scheduler telemetry", { eventType, error: String(err,), },);
  },);
}
