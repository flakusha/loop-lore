// src/autonomy/governor/deny.ts - gate-trip telemetry (fire-and-forget)
//
// Split from ./index.ts to stay under the 250-line size gate. Both denial
// paths (kill-switch + cap trip) share this payload shape; the only
// difference is the `kill_switch` flag and the count/reset mapping.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { record, } from "../../telemetry/service";
import { TELEMETRY_EVENT_TRIPPED, } from "./limits";
import type { AutonomyScope, GovernorLimitName, } from "./types";

/** Emit `governor.budget.exceeded` without ever throwing (log-on-failure). */
export function emitBudgetExceeded(
  db: Kysely<DB>,
  opts: { sessionId?: string; chatId?: string },
  data: {
    scope: AutonomyScope;
    limitName: GovernorLimitName;
    cap: number;
    windowCount: number;
    windowResetAt: string;
    timestamp: string;
    killSwitch?: boolean;
  },
): void {
  record(db, {
    eventType: TELEMETRY_EVENT_TRIPPED,
    sessionId: opts.sessionId ?? null,
    chatId: opts.chatId ?? null,
    data: {
      scope_kind: data.scope.kind,
      scope_id: data.scope.id,
      limit_name: data.limitName,
      cap: data.cap,
      window_count: data.windowCount,
      window_reset_at: data.windowResetAt,
      kill_switch: data.killSwitch ?? false,
      timestamp: data.timestamp,
    },
  },).catch((err: unknown,) => {
    getLogger()
      .child({ module: "autonomy.governor", },)
      .warn("Failed to emit governor.budget.exceeded", { error: String(err,), },);
  },);
}
