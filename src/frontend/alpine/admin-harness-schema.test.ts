// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin harness permission schema contracts: the parked-ask payload,
 * the permissions list body, and the decision body must accept exactly
 * what the routes emit and reject obvious shape violations.
 *
 * Resource contract (parallel-safe): pure in-memory TypeBox validation —
 * no DOM, no DB, no ports, no shared globals, order-independent.
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, it, } from "bun:test";
import {
  HarnessAvailabilitySchema,
  HarnessEscalationDecisionResponse,
  HarnessEscalationsResponse,
  HarnessPendingEscalationSchema,
  HarnessPendingPermissionSchema,
  HarnessPermissionDecisionResponse,
  HarnessPermissionsResponse,
  HarnessQueueCancelResponse,
  HarnessQueuedTurnSchema,
  HarnessQueueEnqueueResponse,
  HarnessQueueResponse,
} from "./admin-harness-schema";

/** A well-formed parked ask, as produced by the permission queue. */
const validPending = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  profile: "p",
  tool: "edit",
  input: { sessionId: "s", kind: "edit", },
  cwd: "/tmp/sandbox",
  arrival: 1_760_000_000_000,
};

describe("admin harness permission schemas", () => {
  it("HarnessPendingPermissionSchema accepts a queued ask (null tool allowed)", () => {
    expect(Value.Check(HarnessPendingPermissionSchema, validPending,),).toBe(true,);
    expect(Value.Check(HarnessPendingPermissionSchema, { ...validPending, tool: null, },),).toBe(true,);
  });

  it("HarnessPendingPermissionSchema rejects missing or mistyped fields", () => {
    expect(Value.Check(HarnessPendingPermissionSchema, { ...validPending, id: 7, },),).toBe(false,);
    const { arrival, ...withoutArrival } = validPending;
    expect(Value.Check(HarnessPendingPermissionSchema, withoutArrival,),).toBe(false,);
  });

  it("HarnessPermissionsResponse wraps the pending-ask array", () => {
    expect(Value.Check(HarnessPermissionsResponse, { items: [validPending,], },),).toBe(true,);
    expect(Value.Check(HarnessPermissionsResponse, { items: [], },),).toBe(true,);
    expect(Value.Check(HarnessPermissionsResponse, { items: [validPending, 3,], },),).toBe(false,);
    expect(Value.Check(HarnessPermissionsResponse, {},),).toBe(false,);
  });

  it("HarnessAvailabilitySchema accepts both verdict arms and rejects shape violations", () => {
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, version: "opencode 9.9.9", },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, version: null, },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: false, reason: "nope", },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, },),).toBe(false,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: false, },),).toBe(false,);
  });

  it("HarnessPermissionDecisionResponse accepts only { ok: boolean }", () => {
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: true, },),).toBe(true,);
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: false, },),).toBe(true,);
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: "yes", },),).toBe(false,);
  });

  it("escalation queue schemas accept the route bodies", () => {
    const pending = {
      id: "esc-1",
      subjectId: "u-1",
      kind: "user",
      targetPath: "/etc",
      rationale: "need root",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expect(Value.Check(HarnessPendingEscalationSchema, pending,),).toBe(true,);
    expect(Value.Check(HarnessPendingEscalationSchema, { ...pending, id: 7, },),).toBe(false,);
    expect(Value.Check(HarnessEscalationsResponse, { items: [pending,], },),).toBe(true,);
    expect(Value.Check(HarnessEscalationsResponse, { items: [pending, 3,], },),).toBe(false,);
    expect(Value.Check(HarnessEscalationDecisionResponse, { ok: true, },),).toBe(true,);
    expect(Value.Check(HarnessEscalationDecisionResponse, { ok: "yes", },),).toBe(false,);
  });
});

/** A well-formed queue turn's common fields, as the queue views emit them. */
const baseTurn = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3302",
  batchId: "batch-1",
  profile: "omp",
  prompt: "do the thing",
  chatId: "chat-1",
  actorId: "actor-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("admin harness turn-queue schemas", () => {
  it("HarnessQueuedTurnSchema accepts every lifecycle arm", () => {
    expect(Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "queued", },),).toBe(true,);
    expect(
      Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "running", startedAt: "2026-01-02T00:00:00.000Z", },),
    ).toBe(true,);

    expect(Value.Check(HarnessQueuedTurnSchema, {
      ...baseTurn,
      status: "completed",
      startedAt: "2026-01-02T00:00:00.000Z",
      finishedAt: "2026-01-03T00:00:00.000Z",
      resultMessageId: "msg-9",
    },),).toBe(true,);

    expect(Value.Check(HarnessQueuedTurnSchema, {
      ...baseTurn,
      status: "failed",
      startedAt: null,
      finishedAt: "2026-01-03T00:00:00.000Z",
      errorCode: "interrupted",
      errorMessage: "process died",
    },),).toBe(true,);

    expect(Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "cancelled", finishedAt: null, },),).toBe(true,);
  });

  it("HarnessQueuedTurnSchema rejects unknown states and broken state fields", () => {
    // No status / no matching literal arm.
    expect(Value.Check(HarnessQueuedTurnSchema, baseTurn,),).toBe(false,);
    expect(Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "moribund", },),).toBe(false,);
    // Mistyped per-state fields.
    expect(Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "running", startedAt: 42, },),).toBe(false,);
    expect(Value.Check(HarnessQueuedTurnSchema, {
      ...baseTurn,
      status: "completed",
      startedAt: "2026-01-02T00:00:00.000Z",
      finishedAt: "2026-01-03T00:00:00.000Z",
      // missing resultMessageId
    },),).toBe(false,);

    expect(Value.Check(HarnessQueuedTurnSchema, {
      ...baseTurn,
      status: "failed",
      startedAt: null,
      finishedAt: "2026-01-03T00:00:00.000Z",
      errorCode: "interrupted",
      // missing errorMessage
    },),).toBe(false,);

    expect(Value.Check(HarnessQueuedTurnSchema, { ...baseTurn, status: "cancelled", finishedAt: 7, },),).toBe(false,);
  });

  it("HarnessQueueResponse wraps the turn array", () => {
    const queued = { ...baseTurn, status: "queued", };
    expect(Value.Check(HarnessQueueResponse, { items: [queued,], },),).toBe(true,);
    expect(Value.Check(HarnessQueueResponse, { items: [], },),).toBe(true,);
    expect(Value.Check(HarnessQueueResponse, { items: [queued, 3,], },),).toBe(false,);
    expect(Value.Check(HarnessQueueResponse, {},),).toBe(false,);
  });

  it("HarnessQueueEnqueueResponse accepts { batchId, turnIds } only", () => {
    expect(Value.Check(HarnessQueueEnqueueResponse, { batchId: "batch-1", turnIds: ["t1", "t2",], },),).toBe(true,);
    expect(Value.Check(HarnessQueueEnqueueResponse, { batchId: "batch-1", turnIds: [], },),).toBe(true,);
    expect(Value.Check(HarnessQueueEnqueueResponse, { batchId: "batch-1", turnIds: [1,], },),).toBe(false,);
    expect(Value.Check(HarnessQueueEnqueueResponse, { batchId: "batch-1", },),).toBe(false,);
    expect(Value.Check(HarnessQueueEnqueueResponse, { turnIds: [], },),).toBe(false,);
  });

  it("HarnessQueueCancelResponse accepts only { ok: boolean }", () => {
    expect(Value.Check(HarnessQueueCancelResponse, { ok: true, },),).toBe(true,);
    expect(Value.Check(HarnessQueueCancelResponse, { ok: false, },),).toBe(true,);
    expect(Value.Check(HarnessQueueCancelResponse, { ok: "yes", },),).toBe(false,);
  });
});
