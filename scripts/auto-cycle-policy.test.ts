// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { restartBackoffMs, } from "../src/services/server-external-manager/supervise";
import {
  backoffMs,
  eligibility,
  type EligibilityReason,
  type PolicyTicket,
  selectModel,
  summaryContract,
} from "./auto-cycle-policy";

/**
 * Resource contract: this suite owns NOTHING.
 *
 * Every function under test is pure, clock-free and I/O-free. No test creates a
 * lane, worktree, port, file, subagent or shared global. Each test builds its
 * own in-memory object, so order and parallel interleaving cannot change a
 * result and there is nothing to release in afterEach.
 */

function ticket(overrides: Partial<PolicyTicket> = {},): PolicyTicket {
  return {
    id: "TASK-sample",
    lane: "lane-sample",
    acceptanceCriteria: ["- [ ] a verifiable criterion",],
    ...overrides,
  };
}

describe("eligibility", () => {
  test("score 3 is the first accepted boundary", () => {
    expect(eligibility(ticket(), [], 3,),).toEqual({ ok: true, id: "TASK-sample", lane: "lane-sample", },);
  });

  test("score 2 is rejected with a reason", () => {
    expect(eligibility(ticket(), [], 2,),).toEqual({
      ok: false,
      id: "TASK-sample",
      reason: "low-score",
    },);
  });

  test("claimed lane is skipped even with a perfect score", () => {
    expect(eligibility(ticket(), ["other-lane", "lane-sample",], 5,),).toEqual({
      ok: false,
      id: "TASK-sample",
      reason: "claimed-lane",
    },);
  });

  test("an unclaimed lane does not block", () => {
    expect(eligibility(ticket(), ["other-lane",], 4,).ok,).toBe(true,);
  });

  test("empty and whitespace-only acceptance criteria reject", () => {
    expect(eligibility(ticket({ acceptanceCriteria: [], },), [], 5,),).toMatchObject({
      reason: "no-acceptance-criteria",
    },);
    expect(eligibility(ticket({ acceptanceCriteria: ["  ", "\n",], },), [], 5,),).toMatchObject({
      reason: "no-acceptance-criteria",
    },);
  });

  test("every rejection path yields a documented reason", () => {
    const verdicts = [
      eligibility(ticket({ lane: "  ", },), [], 5,),
      eligibility(ticket(), ["lane-sample",], 5,),
      eligibility(ticket({ acceptanceCriteria: [], },), [], 5,),
      eligibility(ticket(), [], 2,),
    ];
    const reasons: EligibilityReason[] = [];
    for (const verdict of verdicts) {
      expect(verdict.ok,).toBe(false,);
      if (!verdict.ok) { reasons.push(verdict.reason,); }
    }
    expect(new Set(reasons,),).toEqual(
      new Set<EligibilityReason>(["missing-lane", "claimed-lane", "no-acceptance-criteria", "low-score",],),
    );
  });

  test("a blank lane rejects before score checks", () => {
    expect(eligibility(ticket({ lane: "  ", },), [], 0,),).toMatchObject({ reason: "missing-lane", },);
  });

  test("the ticket id survives every rejection", () => {
    const verdict = eligibility(ticket({ id: "BUG-42", },), ["lane-sample",], 1,);
    expect(verdict.id,).toBe("BUG-42",);
  });
});

describe("selectModel", () => {
  test("user pin overrides a fast modality", () => {
    expect(selectModel({ modality: "testing", userPin: "good", },),).toBe("good",);
  });

  test("user pin overrides a good modality", () => {
    expect(selectModel({ modality: "planning", userPin: "fast", },),).toBe("fast",);
  });

  test.each(["planning", "design", "review",],)("%s maps to good", (modality,) => {
    expect(selectModel({ modality, },),).toBe("good",);
  },);

  test.each(["implementation", "debugging", "testing", "finalization", "research",],)(
    "%s maps to fast",
    (modality,) => {
      expect(selectModel({ modality, },),).toBe("fast",);
    },
  );

  test("modality outranks a tripped breaker", () => {
    expect(selectModel({ modality: "design", breakerTripped: true, },),).toBe("good",);
  });

  test("unknown modality + tripped breaker degrades to fast", () => {
    expect(selectModel({ modality: "other", breakerTripped: true, },),).toBe("fast",);
  });

  test("cache hit is the last tiebreaker for unknown modalities", () => {
    expect(selectModel({ modality: "other", cacheHit: true, },),).toBe("fast",);
  });

  test("unknown modality without signals defaults to good", () => {
    expect(selectModel({ modality: "other", },),).toBe("good",);
  });

  test("cache never overrides a user pin", () => {
    expect(selectModel({ modality: "other", userPin: "good", cacheHit: true, breakerTripped: true, },),).toBe("good",);
  });
});

describe("backoffMs", () => {
  const now = 1_700_000_000_000;

  test("first retry reuses supervise backoff exactly", () => {
    expect(backoffMs(1, null, now,),).toEqual({
      kind: "retry",
      attempt: 1,
      waitMs: restartBackoffMs(1, 1,),
    },);
  });

  test("fourth retry reuses supervise backoff", () => {
    expect(backoffMs(4, null, now,),).toMatchObject({ kind: "retry", waitMs: restartBackoffMs(4, 1,), },);
  });

  test("attempt 5 is exhausted (SUPERVISION_MAX_RESTARTS)", () => {
    expect(backoffMs(5, now + 120_000, now,),).toEqual({ kind: "exhausted", attempt: 5, },);
  });

  test.each([0, -1, 1.5, Number.NaN,],)("invalid attempt %s is exhausted", (attempt,) => {
    expect(backoffMs(attempt, null, now,).kind,).toBe("exhausted",);
  },);

  test("quota reset in the past falls back to backoff", () => {
    expect(backoffMs(2, now - 60_000, now,),).toMatchObject({ waitMs: restartBackoffMs(2, 1,), },);
  });

  test("quota reset in the future extends the wait", () => {
    expect(backoffMs(2, now + 120_000, now,),).toMatchObject({ waitMs: 120_000, },);
  });

  test("the longer of quota reset and backoff wins", () => {
    expect(backoffMs(1, now + 250, now,),).toMatchObject({ waitMs: restartBackoffMs(1, 1,), },);
    expect(backoffMs(1, now + 5_000, now,),).toMatchObject({ waitMs: 5_000, },);
  });

  test("repeat calls are identical — no hidden jitter or clock", () => {
    expect(backoffMs(3, now + 10_000, now,),).toEqual(backoffMs(3, now + 10_000, now,),);
  });
});

describe("summaryContract", () => {
  test("renders every required field with its value", () => {
    const text = summaryContract({
      lane: "lane-x",
      taskId: "TASK-x",
      branch: "auto-cycle-x",
      worktree: "tree/auto-cycle-x",
      status: "interrupted",
      diffStat: "2 files, +30 -0",
      commits: ["abc1234 feat: partial",],
      gates: ["typecheck PASS",],
      filesTouched: ["scripts/a.ts",],
      residuals: ["full check not run",],
      nextStep: "resume from scoped check",
      spendUsd: 1.5,
      elapsedMs: 900_000,
    },);
    for (
      const part of [
        "## INTERRUPTED",
        "**Lane:** lane-x",
        "**Task:** TASK-x",
        "**Branch:** auto-cycle-x",
        "**Worktree:** tree/auto-cycle-x",
        "interrupted — 2 files, +30 -0",
        "abc1234 feat: partial",
        "typecheck PASS",
        "scripts/a.ts",
        "full check not run",
        "resume from scoped check",
        "$1.50 / 900000 ms",
      ]
    ) { expect(text,).toContain(part,); }
  });

  test("empty child result is safe and fully marked", () => {
    const text = summaryContract({},);
    expect(text,).toContain("## INTERRUPTED",);
    expect(text.match(/\(none recorded\)/g,)?.length,).toBe(12,);
    expect(text,).toContain("(none recorded) / (none recorded)",);
  });

  test("empty arrays get the same explicit marker", () => {
    expect(summaryContract({ commits: [], gates: [], filesTouched: [], residuals: [], },),).toContain(
      "  - (none recorded)",
    );
  });

  test("diffStat without status does not emit a dangling separator", () => {
    expect(summaryContract({ diffStat: "1 file", },),).toContain("**Status:** 1 file",);
  });

  test("output is deterministic and clock-free", () => {
    const result = { lane: "lane-x", nextStep: "resume", };
    expect(summaryContract(result,),).toBe(summaryContract(result,),);
  });
});
