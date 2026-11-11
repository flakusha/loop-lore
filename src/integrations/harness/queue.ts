// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * queue.ts — the harness multi-agent turn queue
 * (TASK-harness-multi-agent-turn-queue).
 *
 * Enqueue a BATCH of per-profile harness turns; a bounded worker pool runs
 * them with at most ONE turn in flight per profile (per-profile
 * serialization — an ACP session is never pipelined) and at most
 * `maxConcurrent` turns in flight overall. Each turn is a full
 * `dispatchHarnessTurn` run: the isolation gate, ToS guard, permission queue
 * and exec-log sit inside the dispatch — the queue never reaches around
 * them, and the enqueueing principal is re-presented to the gate at run
 * time (a policy flip between enqueue and run fails the turn, it does not
 * widen access).
 *
 * State is DB rows (`harness_queue_turns`, migration 100), not memory: a
 * crash loses at most the in-flight turn (boot recovery marks it failed
 * `interrupted`; no ACP session survives a restart) and rows left `queued`
 * are claimed by the next pump — the first one after boot.
 *
 * Failure semantics: a failed dispatch is TERMINAL. `error_code` records
 * the dispatch refusal (the `HarnessDispatchCode` vocabulary plus
 * `interrupted`); there is no automatic retry — re-enqueue is the operator's
 * explicit retry, and `attempts` counts claims for observability only.
 * Cancellation is enqueue-time only: a running turn has a live harness
 * process behind it and no interrupt seam, so cancel refuses it.
 */
import { type Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "../../db/enums";
import { type DB, } from "../../db/schema";
import { getChildLogger, type Logger, } from "../../logger";
import { toDate, } from "../../utils/date";
import {
  dispatchHarnessTurn,
  type DispatchHarnessTurnOptions,
  type DispatchHarnessTurnOutcome,
  HarnessDispatchError,
} from "./dispatch";
import {
  cancelQueuedTurn,
  claimNextQueuedTurn,
  completeQueuedTurn,
  failQueuedTurn,
  getQueuedTurn,
  insertQueuedTurns,
  listQueuedTurns,
  type QueuedTurnRow,
  recoverInterruptedTurns,
} from "./queue-store";
import { type HarnessQueueTurnView, rowToView, } from "./queue-views";
import { type HarnessRuntime, } from "./runtime";

/** Logger; null-safe — the queue composes beside boot. */
const log = (): Logger | null => getChildLogger("harness-queue",);

/** Default whole-queue in-flight cap; per profile it is always exactly 1. */
const DEFAULT_MAX_CONCURRENT = 2;

/** One turn a caller wants the queue to run. */
export interface HarnessQueueTurnSpec {
  /** The admin-configured profile to dispatch to. */
  profile: string;
  /** The prompt the harness works on. */
  prompt: string;
  /** The chat the turn's rows land in. */
  chatId: string;
  /** The actor the turn's rows are attributed to. */
  actorId: string;
  /** Correlation id for the exec-log line and the rows' idempotency key. */
  turnKey?: string;
}

/** Options for enqueueing one batch. */
export interface EnqueueHarnessTurnBatchOptions {
  /** The enqueueing user (the turn runs under their authority). */
  requestedBy: string;
  /** The enqueueing principal's site role; the gate re-judges it at run time. */
  requestedRole: string | null;
  /** The turns to run; at least one. */
  turns: HarnessQueueTurnSpec[];
  /** Batch id; minted when absent (all turns of one enqueue share it). */
  batchId?: string;
}

/** The dispatch seam — production is `dispatchHarnessTurn` itself. */
export type HarnessQueueDispatch = (
  options: DispatchHarnessTurnOptions,
) => Promise<DispatchHarnessTurnOutcome>;

/** Options for createHarnessTurnQueue. */
export interface CreateHarnessTurnQueueOptions {
  /** The database the queue's rows land in. */
  database: Kysely<DB>;
  /** The composed runtime getter; null while the integration is disabled. */
  runtime: () => HarnessRuntime | null;
  /** Dispatch seam override; tests inject a stub, production the real path. */
  dispatch?: HarnessQueueDispatch;
  /** Whole-queue in-flight cap; default {@link DEFAULT_MAX_CONCURRENT}. */
  maxConcurrent?: number;
}

/** Why the queue refused an operation. Machine-readable, never a thrown string. */
export type HarnessQueueCode = "harness_disabled" | "empty_batch";

/** A refused queue operation. */
export class HarnessQueueError extends Error {
  /** Machine-readable reason. */
  readonly code: HarnessQueueCode;

  /**
   * @param code - why the operation was refused
   * @param message - human-readable detail
   */
  constructor(code: HarnessQueueCode, message: string,) {
    super(message,);
    this.name = "HarnessQueueError";
    this.code = code;
  }
}

/** The outcome of a cancel attempt — a Result, not a throw. */
export type HarnessQueueCancelResult =
  | { ok: true }
  | { ok: false; code: "unknown_turn" | "not_cancellable" };

/** The queue service: enqueue batches, observe, cancel, drain. */
export interface HarnessTurnQueue {
  /**
   * Insert a batch of turns and start pumping. Returns immediately — the
   * turns run in the background.
   * @throws {HarnessQueueError} `harness_disabled` when no runtime is
   * composed, `empty_batch` when `turns` is empty.
   */
  enqueue(options: EnqueueHarnessTurnBatchOptions,): Promise<{ batchId: string; turnIds: string[] }>;
  /**
   * Cancel a turn that has not started. A running/finished turn is refused
   * (`not_cancellable`), an unknown id reads `unknown_turn`.
   */
  cancel(turnId: string,): Promise<HarnessQueueCancelResult>;
  /** List turns, newest first, optionally scoped to one batch. */
  listTurns(options?: { batchId?: string; limit?: number },): Promise<HarnessQueueTurnView[]>;
  /**
   * Boot recovery + resume: fail rows left `running` by a dead process
   * `interrupted`, then pump so `queued` rows resume. Called by init; safe
   * to call again.
   * @returns how many interrupted rows were failed.
   */
  recoverAndPump(): Promise<number>;
  /** Resolves when no claim, run or pump is in flight — the drain seam. */
  idle(): Promise<void>;
}

/** Async-work counter: `idle()` resolves when it drains to zero. */
let pending = 0;
/** Waiters `idle()` parked while work was in flight. */
const drained: Array<() => void> = [];

/** Count one piece of async work; notify drain waiters when the last ends. */
function track<T,>(work: Promise<T>,): Promise<T> {
  pending++;
  return work.finally(() => {
    pending--;
    if (pending === 0) {
      for (const notify of drained.splice(0, drained.length,)) { notify(); }
    }
  },);
}

/**
 * Build the queue service over its store.
 * @param options - database, runtime getter, optional dispatch override + cap
 * @returns the service.
 */
export function createHarnessTurnQueue(options: CreateHarnessTurnQueueOptions,): HarnessTurnQueue {
  const dispatch = options.dispatch ?? dispatchHarnessTurn;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  /** profile → in-flight turn id: THE per-profile serialization lock. */
  const inFlight = new Map<string, string>();
  let pumping = false;

  /** Claim and start every turn the caps admit; re-armed after each finish. */
  async function pump(): Promise<void> {
    if (pumping) { return; }
    pumping = true;
    try {
      while (inFlight.size < maxConcurrent) {
        const claimed = await claimNextQueuedTurn(options.database, [...inFlight.keys(),], new Date().toISOString(),);
        if (!claimed) { break; }
        inFlight.set(claimed.profile, claimed.id,);
        void track(runClaimed(claimed,),);
      }
    } finally {
      pumping = false;
    }
  }

  /** Run one claimed turn; never rethrows — the row records the outcome. */
  async function runClaimed(row: QueuedTurnRow,): Promise<void> {
    try {
      const runtime = options.runtime();
      if (!runtime) {
        throw new HarnessQueueError("harness_disabled", "the harness runtime is not composed",);
      }

      const outcome = await dispatch({
        runtime,
        role: row.requested_role,
        userId: row.requested_by,
        profile: row.profile,
        prompt: row.prompt,
        database: options.database,
        chatId: row.chat_id,
        actorId: row.actor_id,
        turnKey: row.turn_key ?? undefined,
      },);

      await completeQueuedTurn(options.database, row.id, {
        resultMessageId: outcome.messageId,
        finishedAt: new Date().toISOString(),
      },);

      log()?.info("harness queued turn completed", {
        turnId: row.id,
        batchId: row.batch_id,
        profile: row.profile,
      },);
    } catch (error) {
      // Terminal: the dispatch refusal code is preserved verbatim; any other
      // throw is a turn failure. No retry — re-enqueue is the explicit retry.
      const code = error instanceof HarnessQueueError
        ? error.code === "harness_disabled" ? HarnessQueueErrorCode.HarnessDisabled : HarnessQueueErrorCode.TurnFailed
        : error instanceof HarnessDispatchError
        ? error.code
        : HarnessQueueErrorCode.TurnFailed;

      await failQueuedTurn(options.database, row.id, {
        errorCode: code,
        errorMessage: (error as Error).message,
        finishedAt: new Date().toISOString(),
      },);

      log()?.warn("harness queued turn failed", {
        turnId: row.id,
        batchId: row.batch_id,
        profile: row.profile,
        code,
        error: (error as Error).message,
      },);
    } finally {
      inFlight.delete(row.profile,);
      void track(pump(),);
    }
  }

  return {
    async enqueue(enqueueOptions,) {
      if (!options.runtime()) {
        throw new HarnessQueueError("harness_disabled", "the harness runtime is not composed",);
      }

      if (enqueueOptions.turns.length === 0) {
        throw new HarnessQueueError("empty_batch", "a batch needs at least one turn",);
      }

      const batchId = enqueueOptions.batchId ?? randomUUID();
      // One timestamp per row, strictly increasing within the batch: created_at
      // is the pump's FIFO order, so equal-second rows would tie-break on the
      // random uuid and shuffle batch order. Millisecond offsets keep the
      // enqueue order — the observable contract — deterministic.
      const baseMs = Date.now();
      const turns = enqueueOptions.turns.map((spec, index,) => ({
        id: randomUUID(),
        batchId,
        profile: spec.profile,
        prompt: spec.prompt,
        chatId: spec.chatId,
        actorId: spec.actorId,
        requestedBy: enqueueOptions.requestedBy,
        requestedRole: enqueueOptions.requestedRole,
        turnKey: spec.turnKey,
        createdAt: toDate(baseMs + index,).toISOString(),
      }));

      await insertQueuedTurns(options.database, turns,);
      log()?.info("harness batch enqueued", {
        batchId,
        turns: turns.length,
        profiles: [...new Set(turns.map((turn,) => turn.profile),),],
      },);

      void track(pump(),);

      return { batchId, turnIds: turns.map((turn,) => turn.id), };
    },

    async cancel(turnId,) {
      const row = await getQueuedTurn(options.database, turnId,);
      if (!row) { return { ok: false, code: "unknown_turn", }; }
      if (row.status !== HarnessQueueTurnStatus.Queued) {
        return { ok: false, code: "not_cancellable", };
      }

      const changed = await cancelQueuedTurn(options.database, turnId, new Date().toISOString(),);
      return changed > 0 ? { ok: true, } : { ok: false, code: "not_cancellable", };
    },

    async listTurns(listOptions = {},) {
      const rows = await listQueuedTurns(options.database, listOptions,);
      return rows.map(rowToView,);
    },

    async recoverAndPump() {
      const now = new Date().toISOString();
      const interrupted = await recoverInterruptedTurns(options.database, now,);
      if (interrupted > 0) {
        log()?.warn("harness queue recovered interrupted turns", { interrupted, },);
      }

      await pump();
      return interrupted;
    },

    idle() {
      if (pending === 0) { return Promise.resolve(); }
      return new Promise<void>((resolve,) => {
        drained.push(resolve,);
      },);
    },
  };
}

/** The boot-composed queue; null before boot or when the integration is off. */
let queue: HarnessTurnQueue | null = null;

/**
 * Compose the process's turn queue and run crash recovery + the first pump.
 * Called once at boot beside `initHarnessRuntime`, only when the ACP
 * integration is enabled (a disabled integration composes nothing, so the
 * admin surface reads 503 — inert, never auto-anything).
 * @param options - database, runtime getter, optional dispatch override
 */
export function initHarnessTurnQueue(options: CreateHarnessTurnQueueOptions,): void {
  queue = createHarnessTurnQueue(options,);
  void queue.recoverAndPump();
}

/**
 * The process's turn queue, or null when not composed.
 * @returns the shared queue instance.
 */
export function getHarnessTurnQueue(): HarnessTurnQueue | null {
  return queue;
}

/** Reset the composition. Dev/test only. */
export function resetHarnessTurnQueue(): void {
  queue = null;
}
