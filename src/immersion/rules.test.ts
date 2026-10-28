// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deterministic rule-engine tests (WI-2).
 *
 * Pure-function coverage: each rule's fire/no-fire behavior, explainable
 * reasons naming the missing precondition, config toggles and severity
 * overrides, strongest-first finding order.
 */
import { describe, expect, test, } from "bun:test";
import { evaluateRules, } from "./rules";
import {
  type ActorStateSnapshot,
  DEFAULT_IMMERSION_CONFIG,
  type ExtractedClaim,
  GateRuleId,
  GateSeverity,
  type ImmersionGateConfig,
} from "./types";

const ALLOWED_SNAPSHOT: ActorStateSnapshot = {
  actorId: "a1",
  characterState: "active",
  conditions: [],
  restricted: false,
  skills: ["acrobatics", "stealth",],
  inventory: ["healing potion", "iron sword",],
  pendingConsequences: [],
};

function restrictedSnapshot(): ActorStateSnapshot {
  return {
    ...ALLOWED_SNAPSHOT,
    conditions: ["restrained (ropes)",],
    restricted: true,
  };
}

const MOVEMENT: ExtractedClaim = {
  kind: "movement",
  verb: "sprint",
  text: "I sprint away",
  matchIndex: 0,
};

const SKILL: ExtractedClaim = {
  kind: "skill",
  skill: "fireball",
  text: "I cast fireball",
  matchIndex: 10,
};

const KNOWN_SKILL: ExtractedClaim = { ...SKILL, skill: "acrobatics", };
const ITEM: ExtractedClaim = {
  kind: "item",
  item: "battleaxe",
  action: "wield",
  text: "I attack with my battleaxe",
  matchIndex: 20,
};

const OWNED_ITEM: ExtractedClaim = { ...ITEM, item: "iron sword", };

function configWith(
  ruleId: GateRuleId,
  override: Partial<ImmersionGateConfig["rules"][GateRuleId]>,
): ImmersionGateConfig {
  return {
    rules: {
      ...DEFAULT_IMMERSION_CONFIG.rules,
      [ruleId]: { ...DEFAULT_IMMERSION_CONFIG.rules[ruleId], ...override, },
    },
  };
}

describe("movementWhileRestrained", () => {
  test("captive movement claim fires with explainable reason", () => {
    const findings = evaluateRules({
      claims: [MOVEMENT,],
      snapshot: restrictedSnapshot(),
      config: DEFAULT_IMMERSION_CONFIG,
    },);

    expect(findings,).toHaveLength(1,);
    expect(findings[0]?.ruleId,).toBe(GateRuleId.MovementWhileRestrained,);
    expect(findings[0]?.severity,).toBe(GateSeverity.Annotate,);
    expect(findings[0]?.reason,).toContain("freedom of movement",);
    expect(findings[0]?.reason,).toContain("restrained (ropes)",);
  });

  test("unrestricted actor moving is allowed", () => {
    expect(evaluateRules({
      claims: [MOVEMENT,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },),).toEqual([],);
  });

  test("incapacitating state alone restricts", () => {
    const findings = evaluateRules({
      claims: [MOVEMENT,],
      snapshot: { ...ALLOWED_SNAPSHOT, characterState: "unconscious", restricted: true, },
      config: DEFAULT_IMMERSION_CONFIG,
    },);

    expect(findings,).toHaveLength(1,);
    expect(findings[0]?.reason,).toContain("unconscious",);
  });

  test("disabled rule is skipped", () => {
    expect(evaluateRules({
      claims: [MOVEMENT,],
      snapshot: restrictedSnapshot(),
      config: configWith(GateRuleId.MovementWhileRestrained, { enabled: false, },),
    },),).toEqual([],);
  });

  test("severity override is honored", () => {
    const findings = evaluateRules({
      claims: [MOVEMENT,],
      snapshot: restrictedSnapshot(),
      config: configWith(GateRuleId.MovementWhileRestrained, {
        severity: GateSeverity.SoftRefuse,
      },),
    },);

    expect(findings[0]?.severity,).toBe(GateSeverity.SoftRefuse,);
  });
});

describe("skillNotOwned", () => {
  test("unknown skill fires naming the missing precondition", () => {
    const findings = evaluateRules({
      claims: [SKILL,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },);

    expect(findings[0]?.ruleId,).toBe(GateRuleId.SkillNotOwned,);
    expect(findings[0]?.reason,).toContain('skill "fireball"',);
  });

  test("owned skill is allowed (case-normalized)", () => {
    expect(evaluateRules({
      claims: [KNOWN_SKILL,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },),).toEqual([],);
  });
});

describe("itemNotInInventory", () => {
  test("unowned item fires naming the missing precondition", () => {
    const findings = evaluateRules({
      claims: [ITEM,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },);

    expect(findings[0]?.ruleId,).toBe(GateRuleId.ItemNotInInventory,);
    expect(findings[0]?.reason,).toContain('item "battleaxe" in inventory',);
  });

  test("substring ownership counts (potion ⊆ healing potion)", () => {
    const claim: ExtractedClaim = { ...ITEM, item: "potion", };
    expect(evaluateRules({
      claims: [claim,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },),).toEqual([],);
  });

  test("owned item is allowed", () => {
    expect(evaluateRules({
      claims: [OWNED_ITEM,],
      snapshot: ALLOWED_SNAPSHOT,
      config: DEFAULT_IMMERSION_CONFIG,
    },),).toEqual([],);
  });
});

describe("pendingFailedCheck", () => {
  const constrained: ActorStateSnapshot = {
    ...ALLOWED_SNAPSHOT,
    pendingConsequences: [{
      id: "fc-escape-1",
      blockedAction: "break",
      reason: "the chains held firm",
    },],
  };

  test("constrained action claim fires citing the consequence", () => {
    const claim: ExtractedClaim = {
      kind: "action",
      verb: "break",
      text: "I try to break the chains",
      matchIndex: 0,
    };

    const findings = evaluateRules({
      claims: [claim,],
      snapshot: constrained,
      config: DEFAULT_IMMERSION_CONFIG,
    },);

    expect(findings[0]?.ruleId,).toBe(GateRuleId.PendingFailedCheck,);
    expect(findings[0]?.reason,).toContain("fc-escape-1",);
    expect(findings[0]?.reason,).toContain("the chains held firm",);
  });

  test("unrelated action is unaffected", () => {
    const claim: ExtractedClaim = {
      kind: "action",
      verb: "grab",
      text: "I grab the torch",
      matchIndex: 0,
    };

    expect(evaluateRules({
      claims: [claim,],
      snapshot: constrained,
      config: DEFAULT_IMMERSION_CONFIG,
    },),).toEqual([],);
  });
});

describe("evaluateRules ordering", () => {
  test("stronger severity sorts first and independent rules stack", () => {
    const snapshot: ActorStateSnapshot = {
      ...restrictedSnapshot(),
      pendingConsequences: [{ id: "fc-1", blockedAction: "sprint", reason: "legs gave out", },],
    };

    const findings = evaluateRules({
      claims: [MOVEMENT,],
      snapshot,
      config: {
        rules: {
          ...DEFAULT_IMMERSION_CONFIG.rules,
          [GateRuleId.PendingFailedCheck]: {
            enabled: true,
            severity: GateSeverity.HardBlock,
          },
        },
      },
    },);

    expect(findings,).toHaveLength(2,);
    expect(findings[0]?.ruleId,).toBe(GateRuleId.PendingFailedCheck,);
    expect(findings[1]?.ruleId,).toBe(GateRuleId.MovementWhileRestrained,);
  });
});
