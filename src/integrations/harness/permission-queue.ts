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
 * leaves only through a human decision (`resolve`) or connection death
 * (`withdrawProfile`, wired to `onPermissionWithdrawn`).
 *
 * Every fallible operation returns a Result value — nothing here throws.
 *
 * @module harness-permission-queue
 */

import { getChildLogger, } from "../../logger";
import { type PendingPermission, type PermissionOutcome, } from "./adapter-types";
import { classifyPermission, } from "./permission-policy";

/** The adapter surface the queue needs to answer an ask. */
export interface PermissionRespondable {
  /** Answer the connection's open permission ask. May throw when the ask is gone. */
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
}

/** Why a queued ask was parked instead of auto-allowed. */
export type SubmitResult =
  | { decision: "auto_allow"; reason: string }
  | { decision: "pending"; id: string; reason: string };

/** Typed failure of a decision — a Result, never a throw. */
export type PermissionResolveResult =
  | { ok: true }
  | { ok: false; code: "unknown_request" | "no_connection"; message: string };

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
  async submit(input: { profile: string; pending: PendingPermission; sandboxRoot: string },): Promise<SubmitResult> {
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
  private async evaluate(
    input: { profile: string; pending: PendingPermission; sandboxRoot: string },
  ): Promise<SubmitResult> {
    const verdict = await classifyPermission({
      params: input.pending.params,
      kind: input.pending.kind,
      sandboxRoot: input.sandboxRoot,
    },);

    if (verdict.decision === "auto_allow") {
      const connection = this.opts.connection(input.profile,);
      if (connection) {
        connection.respondPermission(APPROVE_OUTCOME,);
        log()?.info("harness permission auto-allowed", {
          profile: input.profile,
          kind: input.pending.kind,
          reason: verdict.reason,
        },);

        return { decision: "auto_allow", reason: verdict.reason, };
      }

      // Connection lost between ask and verdict: park it — a human can see
      // and deny the dead ask. Never auto-allow through a missing channel.
    }

    const id = crypto.randomUUID();
    const entry: PendingPermissionEntry = {
      id,
      profile: input.profile,
      tool: input.pending.kind,
      input: input.pending.params,
      cwd: input.sandboxRoot,
      arrival: Date.now(),
    };

    this.entries.set(id, entry,);
    log()?.info("harness permission parked for approval", {
      id,
      profile: input.profile,
      kind: input.pending.kind,
      reason: verdict.reason,
    },);

    return { decision: "pending", id, reason: verdict.reason, };
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

    try {
      connection.respondPermission(outcome,);
    } catch (error) {
      log()?.warn("harness permission decision rejected by the connection", {
        id: input.id,
        profile: entry.profile,
        decision: input.decision,
        error: (error as Error).message,
      },);

      return { ok: false, code: "no_connection", message: `profile "${entry.profile}" did not accept the decision`, };
    }

    this.entries.delete(input.id,);
    log()?.info("harness permission decided", {
      id: input.id,
      profile: entry.profile,
      decision: input.decision,
    },);

    return { ok: true, };
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

    if (withdrawn.length > 0) {
      log()?.info("harness permission asks withdrawn with their connection", { profile, count: withdrawn.length, },);
    }

    return withdrawn;
  }
}
