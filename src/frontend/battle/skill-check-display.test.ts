import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderSkillCheckChip, renderSkillCheckResult, setDiceRolling, } from "./skill-check-display";

let restoreDom: () => void;

// The chip labels resolve through the i18n catalog; bun runs every test file
// in one process, so save and restore whatever catalog is in place.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;

beforeEach(() => {
  restoreDom = installBattleDom();
  localeStringsHost.__localeStrings = {
    battle: {
      rollResult: "{roll} {modifier} = {total} vs DC {dc}",
      rollSuccess: "success",
      rollFailure: "failure",
    },
  };
},);

afterEach(() => {
  restoreDom();
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

describe("renderSkillCheckResult", () => {
  it("renders roll, modifier, total and DC", () => {
    const el = renderSkillCheckResult({ roll: 14, modifier: 3, total: 17, dc: 15, critical: null, },);
    expect(el.className,).toBe("battle-skill-check",);
    expect(el.getAttribute("role",),).toBe("status",);
    expect(el.children,).toHaveLength(3,);
    expect(el.children[1]!.textContent,).toBe("14 +3 = 17 vs DC 15",);
  });

  it("marks critical hit", () => {
    const el = renderSkillCheckResult({ roll: 20, modifier: 2, total: 22, dc: 15, critical: "hit", },);
    expect(el.children[2]!.className,).toContain("battle-critical-hit",);
    expect(el.children[2]!.textContent,).toBe("success",);
  });

  it("marks critical fail", () => {
    const el = renderSkillCheckResult({ roll: 1, modifier: 2, total: 3, dc: 15, critical: "fail", },);
    expect(el.children[2]!.className,).toContain("battle-critical-fail",);
    expect(el.children[2]!.textContent,).toBe("failure",);
  });

  it("falls back to the i18n key when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    const el = renderSkillCheckResult({ roll: 14, modifier: 3, total: 17, dc: 15, critical: null, },);
    expect(el.children[1]!.textContent,).toBe("battle.rollResult",);
    expect(el.children[2]!.textContent,).toBe("battle.rollSuccess",);
  });
});

describe("renderSkillCheckChip", () => {
  it("exposes the dice face the animation tumbles", () => {
    const chip = renderSkillCheckChip({ roll: 9, modifier: 1, total: 10, dc: 10, critical: null, },);
    expect(chip.root.className,).toBe("battle-skill-check",);
    expect(chip.dice.className,).toBe("battle-dice",);
    expect(chip.dice.textContent,).toBe("9",);
  });

  it("keeps the delivered verdict over the total-vs-DC comparison", () => {
    // A natural 20 hits whatever the DC is; a natural 1 misses whatever the
    // total is. The backend already resolved both.
    const hit = renderSkillCheckChip({ roll: 20, modifier: 2, total: 22, dc: 25, hit: true, critical: "hit", },);
    expect(hit.root.children[2]!.textContent,).toBe("success",);
    const miss = renderSkillCheckChip({ roll: 1, modifier: 14, total: 15, dc: 15, hit: false, critical: "fail", },);
    expect(miss.root.children[2]!.textContent,).toBe("failure",);
    expect(miss.root.children[2]!.className,).toContain("battle-critical-fail",);
  });

  it("derives the outcome from the DC when no verdict is delivered", () => {
    const hit = renderSkillCheckChip({ roll: 14, modifier: 3, total: 17, dc: 15, critical: null, },);
    expect(hit.root.children[2]!.textContent,).toBe("success",);
    const miss = renderSkillCheckChip({ roll: 4, modifier: 1, total: 5, dc: 15, critical: null, },);
    expect(miss.root.children[2]!.textContent,).toBe("failure",);
  });
});

describe("setDiceRolling", () => {
  it("toggles rolling class", () => {
    const el = document.createElement("span",) as unknown as HTMLElement;
    setDiceRolling(el, true,);
    expect(el.classList.contains("battle-dice-rolling",),).toBe(true,);
    setDiceRolling(el, false,);
    expect(el.classList.contains("battle-dice-rolling",),).toBe(false,);
  });
});
