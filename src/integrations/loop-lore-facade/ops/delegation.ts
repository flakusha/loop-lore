// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300

// src/integrations/loop-lore-facade/ops/delegation.ts — the `delegate_task`
// facade op (TASK-harness-subagent-delegation, slice 1).
//
// An external agent asks loop-lore to run a bounded child harness turn and to
// list/cancel outstanding children. Layering: the op NEVER runs a turn
// itself — spawn enqueues one row in `harness_queue_turns` (the SAME store
// the harness queue pump drains), list reads that store scoped to the calling
// principal, and cancel flips queued → cancelled via `cancelQueuedTurn`.
// Results/lineage ride the existing exec-log; nothing here needs a dashboard.
//
// Slice-1 honesty notes (in the help text, not just docs):
// - Depth is hard-capped at 1 IN CODE: a child is marked in `turn_key` (the
//   row's correlation id) and spawn rejects when the named parent is itself
//   a delegated child. There is no `depth` parameter to smuggle.
// - Budgets are CLAMPED at the trust boundary to the caps below. The queue
//   store has no budget/deadline columns, so dispatch-time step/timeout
//   enforcement arrives in slice 2; today the ceiling bounds admission and
//   the queue's attempts/status lifecycle bounds retries. No parallel store,
//   no migration.
// - Kill-switch: `cancel` moves a `queued` row to `cancelled`. A `running`
//   turn has a live harness process behind it and no interrupt seam
//   (queue-store says so too) — cancel answers 409 instead of lying.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { recordExecRun, } from "../../../harness/exec-recorder";
import {
  cancelQueuedTurn,
  getQueuedTurn,
  insertQueuedTurns,
  listQueuedTurns,
} from "../../harness/queue-store";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeResult, } from "../types";
import { badBodyResult, callerIdentity, callerOwnsActor, notFoundResult, } from "./shared";

/** Shared registration deps — the same shape HandlerOpts carries. */
export interface DelegationFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** Admission caps for spawned children. Injectable so tests pin them. */
export interface DelegationCaps {
  /** Master switch; spawn answers 403 while false. */
  enabled: boolean;
  /** Default per-child step budget when the caller names none. */
  defaultMaxSteps: number;
  /** Hard ceiling: larger requests are clamped, never rejected. */
  maxStepsCeiling: number;
  /** Default per-child timeout when the caller names none. */
  defaultTimeoutMs: number;
  /** Hard ceiling for the timeout, clamped like the step budget. */
  maxTimeoutMsCeiling: number;
  /** How many queued+running children one principal may hold. */
  maxActiveChildren: number;
  /** Page-size ceiling for list. */
  maxListLimit: number;
}

/** Production defaults — become config knobs in slice 2. */
export const DEFAULT_DELEGATION_CAPS: DelegationCaps = {
  enabled: true,
  defaultMaxSteps: 25,
  maxStepsCeiling: 100,
  defaultTimeoutMs: 300_000,
  maxTimeoutMsCeiling: 1_800_000,
  maxActiveChildren: 5,
  maxListLimit: 50,
};

/** `turn_key` prefix marking a queue row as a delegated child. */
const DELEGATE_TURN_KEY_PREFIX = "delegate:";

/** Batch namespace for spawned children (one batch per child). */
const DELEGATE_BATCH_PREFIX = "dlgt:";

/**
 * Whether a queue row is a delegation child (vs a queue-pump turn).
 * Four call sites share this prefix check in lockstep.
 */
function isDelegationRow(turnKey: string | null,): boolean {
  return turnKey !== null && turnKey.startsWith(DELEGATE_TURN_KEY_PREFIX,);
}

/** Whether a queue status still counts as outstanding for list/the cap. */
function isOutstanding(status: string,): boolean {
  return status === "queued" || status === "running";
}

/** Clamp a caller-supplied bound into (0, ceiling], falling back to dflt. */
function clampBound(requested: number | undefined, dflt: number, ceiling: number,): number {
  if (requested === undefined || !Number.isFinite(requested,)) { return dflt; }
  return Math.min(Math.max(1, Math.floor(requested,),), ceiling,);
}

const DelegateSpawnBody = t.Object({
  action: t.Literal("spawn",),
  profile: t.String({ minLength: 1, },),
  prompt: t.String({ minLength: 1, },),
  chatId: t.String({ minLength: 1, },),
  actorId: t.String({ minLength: 1, },),
  maxSteps: t.Optional(t.Number(),),
  timeoutMs: t.Optional(t.Number(),),
  parentDelegationId: t.Optional(t.String({ minLength: 1, },),),
},);

const DelegateListBody = t.Object({
  action: t.Literal("list",),
  limit: t.Optional(t.Number(),),
},);

const DelegateCancelBody = t.Object({
  action: t.Literal("cancel",),
  delegationId: t.String({ minLength: 1, },),
},);

/** `delegate_task` body: exactly one of spawn | list | cancel. */
export const DelegateTaskBody = t.Union([DelegateSpawnBody, DelegateListBody, DelegateCancelBody,],);

/**
 * Handle `spawn`: validate, clamp, depth-check, enqueue one queue row.
 * @param opts - the calling principal, the parsed body, deps and caps
 * @returns the new delegation record
 */
async function handleSpawn(opts: {
  userId: string;
  userRole: string | null;
  body: Static<typeof DelegateSpawnBody>;
  deps: DelegationFacadeDeps;
  caps: DelegationCaps;
},): Promise<FacadeResult> {
  const { userId, userRole, body, deps, caps, } = opts;
  if (!caps.enabled) {
    return {
      ok: false,
      status: 403,
      json: { error: "delegation_disabled", message: "child delegation is disabled", },
    };
  }

  // Depth hard cap: a child may not delegate further. The marker lives in
  // the parent's turn_key, read back from the store — not from caller input.
  // Every delegation row is depth 1, so ANY delegation parent is too deep.
  if (body.parentDelegationId !== undefined) {
    const parent = await getQueuedTurn(deps.database, body.parentDelegationId,);
    if (!parent || parent.requested_by !== userId || !isDelegationRow(parent.turn_key,)) {
      return notFoundResult("parent delegation not found",);
    }

    return {
      ok: false,
      status: 400,
      json: { error: "depth_exceeded", message: "a delegated child may not delegate further (depth 1 max)", },
    };
  }

  if (!(await callerOwnsActor({ database: deps.database, actorId: body.actorId, userId, },))) {
    return notFoundResult("actor not found",);
  }

  const outstanding = (await listQueuedTurns(deps.database, { limit: caps.maxListLimit, },))
    .filter((row,) =>
      row.requested_by === userId && isDelegationRow(row.turn_key,) &&
      isOutstanding(row.status,)
    );

  if (outstanding.length >= caps.maxActiveChildren) {
    return {
      ok: false,
      status: 429,
      json: { error: "too_many_children", message: "active delegation cap reached", },
    };
  }

  const maxSteps = clampBound(body.maxSteps, caps.defaultMaxSteps, caps.maxStepsCeiling,);
  const timeoutMs = clampBound(body.timeoutMs, caps.defaultTimeoutMs, caps.maxTimeoutMsCeiling,);
  const id = randomUUID();
  const turnKey = body.parentDelegationId === undefined
    ? `${DELEGATE_TURN_KEY_PREFIX}${id}`
    : `${DELEGATE_TURN_KEY_PREFIX}${id}:from:${body.parentDelegationId}`;

  await insertQueuedTurns(deps.database, [{
    id,
    batchId: `${DELEGATE_BATCH_PREFIX}${id}`,
    profile: body.profile,
    prompt: body.prompt,
    chatId: body.chatId,
    actorId: body.actorId,
    requestedBy: userId,
    requestedRole: userRole,
    turnKey,
    createdAt: new Date().toISOString(),
  },],);

  recordExecRun({
    taskType: "harness",
    model: "delegation",
    runMs: 0,
    result: "ok",
    task: "delegate_task spawn",
    profile: body.profile,
    msg: `child ${turnKey} by ${userId} (steps ${maxSteps}, timeout ${timeoutMs}ms)`,
  },);

  return {
    ok: true,
    status: 201,
    json: {
      delegationId: id,
      status: "queued",
      depth: 1,
      maxSteps,
      timeoutMs,
      budgetClamped: (body.maxSteps ?? maxSteps) !== maxSteps ||
        (body.timeoutMs ?? timeoutMs) !== timeoutMs,
      parentDelegationId: body.parentDelegationId ?? null,
    },
  };
}

/**
 * Handle `list`: the caller's outstanding delegation children, newest first.
 * @param opts - the calling principal, the parsed body, deps and caps
 * @returns the outstanding delegation records
 */
async function handleList(opts: {
  userId: string;
  body: Static<typeof DelegateListBody>;
  deps: DelegationFacadeDeps;
  caps: DelegationCaps;
},): Promise<FacadeResult> {
  const { userId, body, deps, caps, } = opts;
  const limit = clampBound(body.limit, caps.maxListLimit, caps.maxListLimit,);
  const rows = (await listQueuedTurns(deps.database, { limit, },))
    .filter((row,) =>
      row.requested_by === userId && isDelegationRow(row.turn_key,) &&
      isOutstanding(row.status,)
    );

  return {
    ok: true,
    status: 200,
    json: {
      delegations: rows.map((row,) => {
        const key = row.turn_key ?? "";
        const marker = `${DELEGATE_TURN_KEY_PREFIX}${row.id}:from:`;
        return {
          delegationId: row.id,
          profile: row.profile,
          status: row.status,
          depth: 1,
          parentDelegationId: key.startsWith(marker,) ? key.slice(marker.length,) : null,
          createdAt: row.created_at,
        };
      },),
    },
  };
}

/**
 * Handle `cancel`: flip a queued child to cancelled (the kill-switch). A
 * running turn has no interrupt seam — cancel answers 409, never pretends.
 * @param opts - the calling principal, the parsed body and deps
 * @returns the cancellation outcome
 */
async function handleCancel(opts: {
  userId: string;
  body: Static<typeof DelegateCancelBody>;
  deps: DelegationFacadeDeps;
},): Promise<FacadeResult> {
  const { userId, body, deps, } = opts;
  const row = await getQueuedTurn(deps.database, body.delegationId,);
  // 404 when another principal's child (or a non-delegation row): existence
  // must not leak across principals — the shared facade rule.
  if (!row || row.requested_by !== userId || !isDelegationRow(row.turn_key,)) {
    return notFoundResult("delegation not found",);
  }

  if (row.status !== "queued") {
    return {
      ok: false,
      status: 409,
      json: row.status === "running"
        ? { error: "running_no_interrupt_seam", message: "turn is already running and cannot be interrupted", }
        : { error: "already_finished", message: `turn already ${row.status}`, },
    };
  }

  const moved = await cancelQueuedTurn(deps.database, row.id, new Date().toISOString(),);
  if (moved === 0) {
    return {
      ok: false,
      status: 409,
      json: { error: "already_finished", message: "turn left the queued state before cancel landed", },
    };
  }

  recordExecRun({
    taskType: "harness",
    model: "delegation",
    runMs: 0,
    result: "cancelled",
    task: "delegate_task cancel",
    profile: row.profile,
    msg: `child ${row.turn_key ?? row.id} by ${userId}`,
  },);

  return { ok: true, status: 200, json: { delegationId: row.id, status: "cancelled", }, };
}

/**
 * Register the `delegate_task` op on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the handlers close over
 * @param caps - admission caps (defaults to {@link DEFAULT_DELEGATION_CAPS})
 * @throws {Error} when the op name collides on registration
 */
export function registerDelegateTaskOps(
  registry: FacadeRegistry,
  deps: DelegationFacadeDeps,
  caps: DelegationCaps = DEFAULT_DELEGATION_CAPS,
): void {
  const op: FacadeOp = {
    name: "delegate_task",
    domain: "delegation",
    summary: "Spawn a bounded child harness turn; list or cancel outstanding children",
    description: "spawn enqueues one depth-1 child turn (budgets clamped to the ceiling, " +
      "children cannot delegate further); list shows the caller's outstanding children; " +
      "cancel flips a queued child to cancelled. A running turn has no interrupt seam " +
      "and cancel answers 409. Children are invisible across principals.",
    scope: "chat-write",
    ratePolicy: chatPolicy,
    bodySchema: DelegateTaskBody,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, },
    handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
      if (!Value.Check(DelegateTaskBody, body,)) { return badBodyResult("delegate_task",); }
      const parsed = body as Static<typeof DelegateTaskBody>;
      const { userId, userRole, } = callerIdentity(ctx,);
      switch (parsed.action) {
        case "spawn":
          return handleSpawn({ userId, userRole, body: parsed, deps, caps, },);
        case "list":
          return handleList({ userId, body: parsed, deps, caps, },);
        case "cancel":
          return handleCancel({ userId, body: parsed, deps, },);
      }
    },
  };

  const registered = registry.register(op,);
  if (!registered.ok) {
    throw new Error(registered.message,);
  }
}
