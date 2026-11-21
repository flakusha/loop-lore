// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persists supervisor transitions to the watchdog_events exec log.
 *
 * The supervisor's `onTransition` seam is synchronous; inserts are fired
 * immediately and tracked so the CLI can `flush()` before `process.exit()`
 * (the final stop/crash row must not be lost on shutdown).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import type { WatchdogDecision, WatchdogTransition, } from "./state";

export interface DecisionFields {
  decision_kind: string;
  reason: string | null;
  misses: number | null;
  crashes: number | null;
}

/** Pure projection of a decision onto the nullable exec-log columns. */
export function toDecisionFields(decision: WatchdogDecision,): DecisionFields {
  switch (decision.kind) {
    case "restart":
      return { decision_kind: "restart", reason: null, misses: null, crashes: null, };
    case "kill":
      return { decision_kind: "kill", reason: decision.reason, misses: decision.misses, crashes: null, };
    case "stop":
      return { decision_kind: "stop", reason: decision.reason, misses: null, crashes: decision.crashes, };
    case "wait":
      return { decision_kind: "wait", reason: null, misses: null, crashes: null, };
  }
}

export interface TransitionWriter {
  /** Synchronous seam for `createSupervisor().onTransition`. */
  (transition: WatchdogTransition,): void;
  /** Await all in-flight inserts before shutdown. */
  flush(): Promise<void>;
}

/**
 * @param database - Kysely handle for the instance DB (migrations already applied)
 * @param logger - receives a structured error on write failure; never throws
 * @returns the sync writer with an awaitable `flush()`
 */
export function createTransitionWriter(database: Kysely<DB>, logger: Logger,): TransitionWriter {
  const pending = new Set<Promise<void>>();

  const writer = (transition: WatchdogTransition,): void => {
    const fields = toDecisionFields(transition.decision,);
    const task = (async () => {
      await database.insertInto("watchdog_events",).values({
        event_kind: transition.event_kind,
        decision_kind: fields.decision_kind,
        at_ms: transition.at,
        reason: fields.reason,
        misses: fields.misses,
        crashes: fields.crashes,
      },).execute();
    })().catch((error: unknown,) => {
      logger.error("watchdog exec-log write failed", error instanceof Error ? error : undefined, {
        event_kind: transition.event_kind,
        decision_kind: fields.decision_kind,
      },);
    },).finally(() => {
      pending.delete(task,);
    },);

    pending.add(task,);
  };

  writer.flush = async (): Promise<void> => {
    await Promise.allSettled([...pending,],);
  };

  return writer;
}
