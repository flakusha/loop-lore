// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Opt-in LLM classifier tests (WI-4).
 *
 * Default OFF; downgrade-only merge (never upgrade; hard-block unreachable);
 * budget-saturated skips; aux failure/unparseable labels leave the verdict.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";

import type { AuxCallResult, AuxTaskName, } from "../aux-pipeline/types";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { activeGenerations, chatToAttempt, } from "../generation/cancellation-tracker";
import { createLogger, } from "../logger";
import { auditVerdictWithLlm, } from "./classifier";
import type { GateVerdict, } from "./types";
import { GateRuleId, GateSeverity, } from "./types";

/** A hard-block verdict to audit. */
function hardBlockVerdict(): GateVerdict {
  return {
    severity: GateSeverity.HardBlock,
    ruleId: GateRuleId.MovementWhileRestrained,
    claims: [{ kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },],
    stateSnapshot: {
      actorId: "a1",
      restricted: true,
      characterState: "active",
      conditions: ["bound",],
      skills: [],
      inventory: [],
      pendingConsequences: [],
    },
    findings: [{
      ruleId: GateRuleId.MovementWhileRestrained,
      severity: GateSeverity.HardBlock,
      claim: { kind: "movement", verb: "sprint", text: "I sprint away", matchIndex: 0, },
      reason: "movement while restrained — missing precondition: freedom of movement",
    },],
    engine: "deterministic",
  };
}

/** Config with the classifier flag set to the given value. */
function configWith(flag: boolean,): Config {
  return { hooks: { enableImmersionLlmClassifier: flag, }, } as unknown as Config;
}

/** Aux stub returning a fixed label with attribution. */
function auxReturning(label: string,): typeof import("../aux-pipeline").callAux {
  return async (_task: AuxTaskName,): Promise<AuxCallResult | null> => ({
    content: label,
    model: "stub-model",
    provider: "stub",
    latencyMs: 1,
    promptTokens: 1,
    completionTokens: 1,
  });
}

const OPEN_POLICY = { maxConcurrentGlobal: 0, maxConcurrentPerChat: 0, };
const BASE = {
  db: null as unknown as Kysely<DB>,
  chatId: "c1",
  actorId: "a1",
  content: "I sprint away",
  verdict: hardBlockVerdict(),
  flowPolicy: OPEN_POLICY,
};

createLogger({ level: "error", },);

describe("auditVerdictWithLlm", () => {
  test("default OFF: no aux call, verdict unchanged", async () => {
    let calls = 0;
    const { verdict, audit, } = await auditVerdictWithLlm({
      ...BASE,
      config: configWith(false,),
      auxCall: async () => {
        calls += 1;
        return null;
      },
    },);

    expect(calls,).toBe(0,);
    expect(audit.reason,).toBe("disabled",);
    expect(verdict.engine,).toBe("deterministic",);
  });

  test("downgrades hard-block to soft-refuse with attribution", async () => {
    const { verdict, audit, } = await auditVerdictWithLlm({
      ...BASE,
      config: configWith(true,),
      auxCall: auxReturning("soft-refuse",),
    },);

    expect(audit.applied,).toBe(true,);
    expect(verdict.severity,).toBe(GateSeverity.SoftRefuse,);
    expect(verdict.engine,).toBe("deterministic+llm-downgrade",);
    expect(verdict.findings,).toHaveLength(1,);
  });

  test("never upgrades: soft-refuse suggestion on an annotate verdict is a no-op", async () => {
    const annotateVerdict = {
      ...hardBlockVerdict(),
      severity: GateSeverity.Annotate,
      findings: [{ ...hardBlockVerdict().findings[0]!, severity: GateSeverity.Annotate, },],
    };

    const { verdict, audit, } = await auditVerdictWithLlm({
      ...BASE,
      verdict: annotateVerdict,
      config: configWith(true,),
      auxCall: auxReturning("soft-refuse",),
    },);

    expect(audit.applied,).toBe(false,);
    expect(audit.reason,).toBe("no-downgrade",);
    expect(verdict.severity,).toBe(GateSeverity.Annotate,);
  });

  test("unparseable label leaves the verdict unchanged", async () => {
    const { verdict, audit, } = await auditVerdictWithLlm({
      ...BASE,
      config: configWith(true,),
      auxCall: auxReturning("hard-block!!!",),
    },);

    expect(audit.applied,).toBe(false,);
    expect(audit.reason,).toBe("unparseable",);
    expect(verdict.severity,).toBe(GateSeverity.HardBlock,);
  });

  test("budget-saturated skips the audit entirely", async () => {
    // Seed one live generation in this chat; per-chat cap 1 => saturated.
    activeGenerations.set("att-c1", { chatId: "c1", attemptId: "att-c1", } as never,);
    chatToAttempt.set("c1", "att-c1",);
    let calls = 0;
    try {
      const { verdict, audit, } = await auditVerdictWithLlm({
        ...BASE,
        config: configWith(true,),
        flowPolicy: { maxConcurrentGlobal: 0, maxConcurrentPerChat: 1, },
        auxCall: async () => {
          calls += 1;
          return null;
        },
      },);

      expect(calls,).toBe(0,);
      expect(audit.reason,).toBe("budget-saturated",);
      expect(verdict.severity,).toBe(GateSeverity.HardBlock,);
    } finally {
      activeGenerations.delete("att-c1",);
      chatToAttempt.delete("c1",);
    }
  });
});
