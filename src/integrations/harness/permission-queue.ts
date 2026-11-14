// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-queue.ts — the runtime-owned queue of ACP permission asks that
 * await a human decision (TASK-permission-approval-flow).
 *
 * The queue multiplexes across profile connections: each connection parks at
 * most one `session/request_permission` (the protocol layer's single slot);
 * this queue collects the asks that need a human from ALL profiles in FIFO
 * arrival order. Asks the policy auto-allows never reach the queue — they
 * are answered `allow_once` immediately at submit time.
 *
 * Pending semantics: a queued ask blocks its turn with NO timeout at any
 * layer — auto-approving on a timer would violate default-deny. An entry
 * leaves through a human decision (`resolve`), the harness withdrawing the ask
 * (`withdrawProfile`, wired to `onPermissionWithdrawn`), or the harness
 * reporting that the ask is GONE — a vanished ask has nothing left to decide,
 * so its entry goes with it.
 *
 * Every fallible operation returns a Result value — nothing here throws.
 *
 * @module harness-permission-queue
 */

import { getChildLogger, } from "../../logger";
import {
  type PendingPermission,
  PermissionAskGoneError,
  PermissionDecisionRefusedError,
  type PermissionOutcome,
} from "./adapter-types";
import { advertisedPermissionOptions, type WirePermissionOutcome, wirePermissionOutcome, } from "./permission-outcome";
import { classifyPermission, } from "./permission-policy";

/** One ask's inputs: the profile, the raw pending ask, and the session's sandbox cwd. */
type AskInput = { profile: string; pending: PendingPermission; sandboxRoot: string };

/** One ask's evaluation result, ready to park. */
type ParkableAsk = { input: AskInput; reason: string; undeliverableReason: string | null; withdrawnAt: number };

/** The adapter surface the queue needs to answer an ask. */
export interface PermissionRespondable {
  /**
   * Answer the connection's open permission ask.
   * @throws {PermissionAskGoneError} when the harness no longer holds the ask.
   */
  respondPermission(outcome: PermissionOutcome,): void;
}

/** One ask parked for human approval, in FIFO arrival order. */
export interface PendingPermissionEntry {
  /** Queue-assigned id the web surface addresses decisions by. */
  readonly id: string;
  /** The harness profile whose connection asked. */
  readonly profile: string;
  /** The ACP tool-call kind, when the harness gave one. */
  readonly tool: string | null;
  /** Raw `session/request_permission` params, verbatim. */
  readonly input: unknown;
  /** The sandbox cwd the ask's session runs in. */
  readonly cwd: string;
  /** Arrival timestamp (Date.now()). */
  readonly arrival: number;
  /**
   * Why the ask could not be answered when it arrived, or null while it
   * awaits a decision. A parked ask with a reason may still be delivered by a
   * retry — the connection can recover.
   */
  readonly undeliverableReason: string | null;
}

/** What became of one submitted ask: auto-allowed, parked for a decision, or gone. */
export type SubmitResult =
  | { decision: "auto_allow"; reason: string }
  | { decision: "pending"; id: string; reason: string }
  | { decision: "withdrawn"; reason: string };

/** The queue's typed failure codes. */
export type PermissionFailureCode = "unknown_request" | "no_connection" | "ask_gone" | "refused" | "not_delivered";

/** The outcome of a decision — a Result, never a throw. */
export type PermissionResolveResult =
  | { ok: true; answer: WirePermissionOutcome }
  | { ok: false; code: PermissionFailureCode; message: string };

/** The human decision the web surface can express. */
export type PermissionDecision = "approve" | "deny";

/** Options for {@link PermissionQueue}. */
export interface PermissionQueueOptions {
  /** The live connection for a profile, when one exists. */
  connection(profile: string,): PermissionRespondable | undefined;
}

/** Logger; null-safe — the queue must work before logger init. */
const log = (): ReturnType<typeof getChildLogger> | null => getChildLogger("harness-permission",);

/** Outcome sent when the human approves. */
const APPROVE_OUTCOME: PermissionOutcome = { outcome: "allow_once", };
/** Outcome sent when the human denies. */
const DENY_OUTCOME: PermissionOutcome = { outcome: "reject_once", };

/**
 * FIFO queue of permission asks awaiting a human, owned by the runtime.
 */
export class PermissionQueue {
  private readonly opts: PermissionQueueOptions;
  /** Insertion-ordered: iteration IS the FIFO order. */
  private readonly entries = new Map<string, PendingPermissionEntry>();
  /** Withdrawals per profile; a bump means the profile's ask was answered or gone. */
  private readonly withdrawals = new Map<string, number>();
  /** Submits currently evaluating; drained by {@link idle}. */
  private readonly inFlight = new Set<Promise<SubmitResult>>();

  /**
   * @param opts - connection lookup, resolved again at decision time so a
   *   respawned connection answers rather than a captured stale one.
   */
  constructor(opts: PermissionQueueOptions,) {
    this.opts = opts;
  }

  /**
   * Evaluate one ask: auto-allow read-only-in-sandbox immediately, park
   * everything else. Never rejects; policy failures park the ask. In-flight
   * submissions are tracked so {@link idle} can await them.
   * @param input - profile, raw pending ask, and the session's sandbox cwd
   * @returns what happened to the ask.
   */
  async submit(input: AskInput,): Promise<SubmitResult> {
    const task = this.evaluate(input,);
    this.inFlight.add(task,);
    try {
      return await task;
    } finally {
      this.inFlight.delete(task,);
    }
  }

  /**
   * Resolves once no submit is evaluating. Test and shutdown seam: the
   * adapter-facing `onPermissionRequest` wrapper is fire-and-forget, so
   * observers settle through here instead of sleeps.
   */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight,],);
    }
  }

  /** The actual policy evaluation for one ask. */
  private async evaluate(input: AskInput,): Promise<SubmitResult> {
    const withdrawnAt = this.withdrawals.get(input.profile,) ?? 0;
    const verdict = await classifyPermission({
      params: input.pending.params,
      kind: input.pending.kind,
      sandboxRoot: input.sandboxRoot,
    },);

    if (verdict.decision === "auto_allow") {
      const connection = this.opts.connection(input.profile,);
      if (connection) {
        try {
          connection.respondPermission(APPROVE_OUTCOME,);
          log()?.info("harness permission auto-allowed", {
            profile: input.profile,
            kind: input.pending.kind,
            reason: verdict.reason,
          },);

          return { decision: "auto_allow", reason: verdict.reason, };
        } catch (error) {
          if (error instanceof PermissionAskGoneError) {
            // The harness no longer holds the ask — the turn was cancelled or
            // the ask was withdrawn — so there is nothing left to decide and
            // nothing to park.
            log()?.info(`harness permission ask no longer awaits the decision: ${(error as Error).message}`, {
              profile: input.profile,
              kind: input.pending.kind,
            },);

            return { decision: "withdrawn", reason: (error as Error).message, };
          }

          // A transient delivery failure: the ask may still be there, so it is
          // parked with the reason — a retry may deliver it.
          log()?.warn("harness permission auto-allow could not be delivered", {
            profile: input.profile,
            kind: input.pending.kind,
            reason: verdict.reason,
            error: (error as Error).message,
          },);

          return this.park({
            input,
            reason: verdict.reason,
            undeliverableReason: `the decision could not be delivered: ${
              (error as Error).message
            } — a retry may deliver it`,
            withdrawnAt,
          },);
        }
      }

      // Connection lost between ask and verdict: park it — a human can see
      // and deny the dead ask. Never auto-allow through a missing channel.
      return this.park({
        input,
        reason: verdict.reason,
        undeliverableReason: "the profile has no live connection to deliver the decision",
        withdrawnAt,
      },);
    }

    return this.park({ input, reason: verdict.reason, undeliverableReason: null, withdrawnAt, },);
  }

  /**
   * Park one ask for a human decision — unless the harness withdrew it while
   * it was classified, in which case there is nothing left to decide.
   * @param item - the ask, the verdict's reason, why it is undeliverable,
   *   and the profile's withdrawal count when the ask arrived.
   * @returns what happened to the ask.
   */
  private park(item: ParkableAsk,): SubmitResult {
    if ((this.withdrawals.get(item.input.profile,) ?? 0) !== item.withdrawnAt) {
      // The ask was withdrawn while it was classified — a cancelled turn
      // answers the parked ask — so parking it now would strand a row no
      // decision can ever clear.
      log()?.info("harness permission ask withdrawn while it was classified", {
        profile: item.input.profile,
        kind: item.input.pending.kind,
      },);

      return { decision: "withdrawn", reason: "the harness withdrew the ask", };
    }

    const id = crypto.randomUUID();
    const entry: PendingPermissionEntry = {
      id,
      profile: item.input.profile,
      tool: item.input.pending.kind,
      input: item.input.pending.params,
      cwd: item.input.sandboxRoot,
      arrival: Date.now(),
      undeliverableReason: item.undeliverableReason,
    };

    this.entries.set(id, entry,);
    log()?.info("harness permission parked for approval", {
      id,
      profile: item.input.profile,
      kind: item.input.pending.kind,
      reason: item.reason,
      undeliverable: item.undeliverableReason,
    },);

    return { decision: "pending", id, reason: item.reason, };
  }

  /** Pending asks, oldest first. */
  listPending(): PendingPermissionEntry[] {
    return [...this.entries.values(),];
  }

  /** How many asks await a decision. */
  pendingCount(): number {
    return this.entries.size;
  }

  /**
   * Apply a human decision to one queued ask. Unknown id and a connection
   * that cannot accept the decision are typed failures, not throws.
   *
   * The decision's wire answer is the mapping the connection applies to the
   * ask's advertised options. A refusal - the harness could not express the
   * decision - reports the `refused` code; a vanished ask reports `ask_gone`.
   * @param input - the entry id and the decision
   * @returns ok, or a typed failure.
   */
  resolve(input: { id: string; decision: PermissionDecision },): PermissionResolveResult {
    const entry = this.entries.get(input.id,);
    if (!entry) {
      return { ok: false, code: "unknown_request", message: `no pending permission request with id "${input.id}"`, };
    }

    const connection = this.opts.connection(entry.profile,);
    const outcome = input.decision === "approve" ? APPROVE_OUTCOME : DENY_OUTCOME;
    if (!connection) {
      // Deny is terminal cleanup: the ask is unreachable, so drop it.
      // Approve is retriable: keep the entry in case the profile respawns.
      if (input.decision === "deny") {
        this.entries.delete(input.id,);
      }

      log()?.warn("harness permission decided without a live connection", {
        id: input.id,
        profile: entry.profile,
        decision: input.decision,
      },);

      return { ok: false, code: "no_connection", message: `profile "${entry.profile}" has no live connection`, };
    }

    // The answer the connection maps this decision to: the ask's raw params
    // (the options the connection advertised) and the same mapping, so the log
    // names what went on the wire.
    const answer = wirePermissionOutcome(outcome, advertisedPermissionOptions(entry.input,),);
    try {
      connection.respondPermission(outcome,);
    } catch (error) {
      if (error instanceof PermissionAskGoneError) {
        // The harness no longer holds the ask: nothing is left to decide, so
        // the entry goes with it — a stuck row would never clear.
        this.entries.delete(input.id,);
        log()?.info(`harness permission ask no longer awaits the decision: ${(error as Error).message}`, {
          id: input.id,
          profile: entry.profile,
          decision: input.decision,
        },);

        const code = error instanceof PermissionDecisionRefusedError ? "refused" : "ask_gone";
        return { ok: false, code, message: `${(error as Error).message} (profile "${entry.profile}")`, };
      }

      log()?.warn("harness permission decision rejected by the connection", {
        id: input.id,
        profile: entry.profile,
        decision: input.decision,
        error: (error as Error).message,
      },);

      const parked = this.entries.get(input.id,);
      if (parked) {
        const reason = `the decision could not be delivered: ${(error as Error).message} — a retry may deliver it`;
        this.entries.set(input.id, { ...parked, undeliverableReason: reason, },);
      }

      return { ok: false, code: "not_delivered", message: `profile "${entry.profile}" did not accept the decision`, };
    }

    this.entries.delete(input.id,);
    log()?.info("harness permission decided", {
      id: input.id,
      profile: entry.profile,
      decision: input.decision,
      answer,
    },);

    return { ok: true, answer, };
  }

  /**
   * Drop every pending ask of one profile (its connection died or closed).
   * @param profile - the profile whose asks are withdrawn
   * @returns the withdrawn entry ids, in FIFO order.
   */
  withdrawProfile(profile: string,): string[] {
    const withdrawn: string[] = [];
    for (const [id, entry,] of this.entries) {
      if (entry.profile === profile) {
        this.entries.delete(id,);
        withdrawn.push(id,);
      }
    }

    this.withdrawals.set(profile, (this.withdrawals.get(profile,) ?? 0) + 1,);

    if (withdrawn.length > 0) {
      log()?.info("harness permission asks withdrawn with their connection", { profile, count: withdrawn.length, },);
    }

    return withdrawn;
  }
}
