// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Severity vocabulary unit tests.
 *
 * The ladder arithmetic is the heart of the two-engine precedence
 * contract: deterministic findings take the stronger severity; the
 * (opt-in) classifier may only downgrade.
 */
import { describe, expect, test, } from "bun:test";

import {
  downgradeSeverity,
  GATE_RULE_ORDER,
  GateRuleId,
  GateSeverity,
  MAX_CLAIMS_PER_MESSAGE,
  maxSeverity,
  severityRank,
} from "./types";

describe("severityRank", () => {
  test("ranks the ladder monotonically", () => {
    expect(severityRank(GateSeverity.Allow,),).toBeLessThan(severityRank(GateSeverity.Annotate,),);
    expect(severityRank(GateSeverity.Annotate,),).toBeLessThan(severityRank(GateSeverity.SoftRefuse,),);
    expect(severityRank(GateSeverity.SoftRefuse,),).toBeLessThan(severityRank(GateSeverity.HardBlock,),);
  });
});

describe("maxSeverity", () => {
  test("returns the stronger severity", () => {
    expect(maxSeverity(GateSeverity.Allow, GateSeverity.HardBlock,),).toBe(GateSeverity.HardBlock,);
    expect(maxSeverity(GateSeverity.Annotate, GateSeverity.SoftRefuse,),).toBe(GateSeverity.SoftRefuse,);
    expect(maxSeverity(GateSeverity.Allow, GateSeverity.Allow,),).toBe(GateSeverity.Allow,);
  });
});

describe("downgradeSeverity", () => {
  test("moves only downward", () => {
    expect(downgradeSeverity(GateSeverity.HardBlock, GateSeverity.SoftRefuse,),).toBe(GateSeverity.SoftRefuse,);
    expect(downgradeSeverity(GateSeverity.Annotate, GateSeverity.Allow,),).toBe(GateSeverity.Allow,);
  });

  test("never upgrades — the classifier cannot strengthen a verdict", () => {
    expect(downgradeSeverity(GateSeverity.Annotate, GateSeverity.SoftRefuse,),).toBe(GateSeverity.Annotate,);
    expect(downgradeSeverity(GateSeverity.Allow, GateSeverity.HardBlock,),).toBe(GateSeverity.Allow,);
    expect(downgradeSeverity(GateSeverity.HardBlock, GateSeverity.HardBlock,),).toBe(GateSeverity.HardBlock,);
  });
});

describe("GATE_RULE_ORDER", () => {
  test("lists every rule exactly once in evaluation order", () => {
    expect(GATE_RULE_ORDER,).toEqual([
      GateRuleId.MovementWhileRestrained,
      GateRuleId.SkillNotOwned,
      GateRuleId.ItemNotInInventory,
      GateRuleId.PendingFailedCheck,
    ],);

    expect(new Set(GATE_RULE_ORDER,).size,).toBe(GATE_RULE_ORDER.length,);
  });
});

describe("MAX_CLAIMS_PER_MESSAGE", () => {
  test("bounds extraction to a small finite cap", () => {
    expect(MAX_CLAIMS_PER_MESSAGE,).toBeGreaterThan(0,);
    expect(MAX_CLAIMS_PER_MESSAGE,).toBeLessThanOrEqual(20,);
  });
});
