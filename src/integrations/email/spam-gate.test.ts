// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inbound email spam gate fixtures (federation-email-channel.md §7).
 *
 * Clock is injected — no real timers; verdicts are plain data.
 */
import { describe, expect, test, } from "bun:test";
import type { AdapterMessage, } from "../adapter";
import {
  createEmailSpamGate,
  DEFAULT_SPAM_THRESHOLD,
  NOT_ON_ALLOW_LIST_SCORE,
  type SpamVerdict,
} from "./spam-gate";

function mail(id: string, author: string,): AdapterMessage {
  return { id, author, target: "user@loop.example", body: "hi", timestamp: 7, };
}

describe("EmailSpamGate.check", () => {
  test("delivers unconfigured traffic with a zero score", () => {
    const gate = createEmailSpamGate();
    expect(gate.check(mail("m1", "anyone@anywhere.test",),),).toEqual({ action: "deliver", score: 0, reasons: [], },);
  });

  test("rejects blocklisted senders before scoring or quarantine", () => {
    const gate = createEmailSpamGate({ blockList: ["SPAM@evil.example",], },);
    const verdict = gate.check(mail("m1", "Bulk Mailer <spam@evil.example>",),);
    expect(verdict,).toEqual({
      action: "reject",
      code: "blocked_sender",
      score: 0,
      reasons: ["sender is blocklisted",],
    },);

    expect(gate.quarantined(),).toEqual([],);
  });

  test("quarantines an unknown sender when an allow list is configured", () => {
    let at = 1_000;
    const gate = createEmailSpamGate({ allowList: ["friend@example.com",], now: () => at, },);
    expect(gate.check(mail("m1", "Friend <FRIEND@example.com>",),),).toEqual({
      action: "deliver",
      score: 0,
      reasons: [],
    },);

    const verdict = gate.check(mail("m2", "stranger@other.test",),);
    expect(verdict,).toEqual({
      action: "quarantine",
      score: NOT_ON_ALLOW_LIST_SCORE,
      reasons: [`sender is not on the allow list (+${NOT_ON_ALLOW_LIST_SCORE})`,],
    },);

    const held = gate.quarantined();
    expect(held.length,).toBe(1,);
    expect(held[0]?.sender,).toBe("stranger@other.test",);
    expect(held[0]?.message.id,).toBe("m2",);
    expect(held[0]?.quarantinedAt,).toBe(1_000,);
  });

  test("delivers with a penalty when the threshold is raised past the score", () => {
    const gate = createEmailSpamGate({
      allowList: ["friend@example.com",],
      spamThreshold: DEFAULT_SPAM_THRESHOLD + 1,
    },);

    const verdict: SpamVerdict = gate.check(mail("m1", "stranger@other.test",),);
    expect(verdict.action,).toBe("deliver",);
    expect(verdict.score,).toBe(NOT_ON_ALLOW_LIST_SCORE,);
    expect(gate.quarantined(),).toEqual([],);
  });

  test("evicts the oldest mail past the quarantine cap", () => {
    const gate = createEmailSpamGate({ allowList: ["friend@example.com",], maxQuarantined: 2, },);
    gate.check(mail("m1", "a@one.test",),);
    gate.check(mail("m2", "b@two.test",),);
    gate.check(mail("m3", "c@three.test",),);
    expect(gate.quarantined().map((entry,) => entry.message.id),).toEqual(["m2", "m3",],);
  });
});

describe("EmailSpamGate rate limiting", () => {
  test("rejects the burst-exceeded sender and repays after a refill", () => {
    let at = 0;
    const gate = createEmailSpamGate({ perSender: { capacity: 2, refillMs: 1_000, }, now: () => at, },);
    expect(gate.check(mail("m1", "chatty@one.test",),).action,).toBe("deliver",);
    expect(gate.check(mail("m2", "chatty@one.test",),).action,).toBe("deliver",);

    const limited = gate.check(mail("m3", "chatty@one.test",),);
    expect(limited,).toMatchObject({ action: "reject", code: "rate_limited", },);
    if (limited.action === "reject") { expect(limited.retryAfterMs,).toBeGreaterThan(0,); }
    expect(gate.check(mail("m4", "other@two.test",),).action,).toBe("deliver",);

    at = 1_000;
    expect(gate.check(mail("m5", "chatty@one.test",),).action,).toBe("deliver",);
  });

  test("perSender null disables the budget", () => {
    const gate = createEmailSpamGate({ perSender: null, },);
    for (let i = 0; i < 20; i++) {
      expect(gate.check(mail(`m${i}`, "busy@one.test",),).action,).toBe("deliver",);
    }
  });

  test("reset clears quarantine and budgets", () => {
    let at = 0;
    const gate = createEmailSpamGate({
      perSender: { capacity: 1, refillMs: 60_000, },
      allowList: ["friend@example.com",],
      now: () => at,
    },);

    expect(gate.check(mail("m1", "stranger@other.test",),).action,).toBe("quarantine",);
    expect(gate.check(mail("m2", "friend@example.com",),).action,).toBe("deliver",);
    expect(gate.check(mail("m3", "friend@example.com",),).action,).toBe("reject",);

    gate.reset();
    expect(gate.quarantined(),).toEqual([],);
    expect(gate.check(mail("m4", "friend@example.com",),).action,).toBe("deliver",);
  });
});
