// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Refusal narration builder tests (WI-5, SC7 kind semantics).
 *
 * soft-refuse → narration framing (in-fiction, never moralized);
 * annotate → consistency hint; hard-block → OOC notice offering the skip
 * escape hatch (TASK-turn-skip-gate-interlock).
 */
import { describe, expect, test, } from "bun:test";

import {
  buildAnnotateHint,
  buildHardBlockNotice,
  buildSoftRefuseFraming,
  gateVerdictEventPayload,
} from "./narration";
import type { GateVerdict, } from "./types";
import { GateRuleId, GateSeverity, } from "./types";

/** A minimal soft-refuse verdict for builder tests. */
function softRefuseVerdict(): GateVerdict {
  return {
    severity: GateSeverity.SoftRefuse,
    ruleId: GateRuleId.MovementWhileRestrained,
    claims: [{ kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },],
    stateSnapshot: {
      actorId: "a1",
      restricted: true,
      characterState: "active",
      conditions: [],
      skills: [],
      inventory: [],
      pendingConsequences: [],
    },
    findings: [{
      ruleId: GateRuleId.MovementWhileRestrained,
      severity: GateSeverity.SoftRefuse,
      claim: { kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },
      reason: "movement while restrained — missing precondition: freedom of movement",
    },],
    engine: "deterministic",
  };
}

/** Moralizing vocabulary that must never appear in in-fiction gate text. */
const MORALIZING = ["inappropriate", "not allowed", "policy", "violat", "offensive", "warning",];

describe("buildSoftRefuseFraming", () => {
  test("states the attempt and failure in-fiction without moralizing", () => {
    const framing = buildSoftRefuseFraming(softRefuseVerdict(),);
    expect(framing,).toContain("I sprint away",);
    expect(framing,).toContain("freedom of movement",);
    expect(framing,).toContain("does not succeed",);
    for (const word of MORALIZING) {
      expect(framing.toLowerCase(),).not.toContain(word,);
    }
  });
});

describe("buildAnnotateHint", () => {
  test("carries the constraint reason as a scene note", () => {
    const hint = buildAnnotateHint(softRefuseVerdict(),);
    expect(hint,).toContain("Consistency note",);
    expect(hint,).toContain("freedom of movement",);
    for (const word of MORALIZING) {
      expect(hint.toLowerCase(),).not.toContain(word,);
    }
  });
});

describe("buildHardBlockNotice", () => {
  test("is OOC and offers the turn-skip escape hatch", () => {
    const notice = buildHardBlockNotice(softRefuseVerdict(), { actorName: "Kara", },);
    expect(notice,).toContain("[OOC]",);
    expect(notice,).toContain("turn skip",);
    expect(notice,).toContain("Kara",);
    expect(notice,).toContain("freedom of movement",);
  });
});

describe("gateVerdictEventPayload", () => {
  test("carries chat, actor, severity, rule and engine attribution", () => {
    const payload = gateVerdictEventPayload(softRefuseVerdict(), { chatId: "c1", actorId: "a1", },);
    expect(payload,).toMatchObject({
      chatId: "c1",
      actorId: "a1",
      severity: GateSeverity.SoftRefuse,
      ruleId: GateRuleId.MovementWhileRestrained,
      engine: "deterministic",
    },);
  });
});
