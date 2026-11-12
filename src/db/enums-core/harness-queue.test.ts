// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * harness-queue.ts enum contracts: the turn lifecycle and the closed
 * failure vocabulary are string consts whose values must stay exhaustive
 * over their own union types — a new status or error code must land in
 * BOTH the const and the union (and in every shape that switches on them).
 *
 * Resource contract (parallel-safe): pure const reads — no DB, no ports,
 * no shared globals, order-independent.
 */
import { describe, expect, it, } from "bun:test";
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "./harness-queue";

describe("HarnessQueueTurnStatus", () => {
  it("carries the five lifecycle values verbatim", () => {
    expect(HarnessQueueTurnStatus.Queued,).toBe("queued",);
    expect(HarnessQueueTurnStatus.Running,).toBe("running",);
    expect(HarnessQueueTurnStatus.Completed,).toBe("completed",);
    expect(HarnessQueueTurnStatus.Failed,).toBe("failed",);
    expect(HarnessQueueTurnStatus.Cancelled,).toBe("cancelled",);
  });

  it("is exhaustive over its union type", () => {
    // Compile-time ratchet: a union member without a key here fails to build.
    const coverage: Record<HarnessQueueTurnStatus, true> = {
      queued: true,
      running: true,
      completed: true,
      failed: true,
      cancelled: true,
    };

    // Runtime pin: const keys in declaration order, values == union members.
    expect(Object.keys(HarnessQueueTurnStatus,),).toEqual(
      ["Queued", "Running", "Completed", "Failed", "Cancelled",],
    );

    expect(Object.values(HarnessQueueTurnStatus,),).toEqual(Object.keys(coverage,),);
  });
});

describe("HarnessQueueErrorCode", () => {
  it("carries the closed refusal vocabulary verbatim", () => {
    expect(HarnessQueueErrorCode.HarnessDisabled,).toBe("harness_disabled",);
    expect(HarnessQueueErrorCode.RoleDenied,).toBe("role_denied",);
    expect(HarnessQueueErrorCode.ProfileUnknown,).toBe("profile_unknown",);
    expect(HarnessQueueErrorCode.TurnFailed,).toBe("turn_failed",);
    expect(HarnessQueueErrorCode.Interrupted,).toBe("interrupted",);
  });

  it("is exhaustive over its union type", () => {
    // Compile-time ratchet: a union member without a key here fails to build.
    const coverage: Record<HarnessQueueErrorCode, true> = {
      harness_disabled: true,
      role_denied: true,
      profile_unknown: true,
      turn_failed: true,
      interrupted: true,
    };

    // Runtime pin: const keys in declaration order, values == union members.
    expect(Object.keys(HarnessQueueErrorCode,),).toEqual(
      ["HarnessDisabled", "RoleDenied", "ProfileUnknown", "TurnFailed", "Interrupted",],
    );

    expect(Object.values(HarnessQueueErrorCode,),).toEqual(Object.keys(coverage,),);
  });
});
