import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderSkillCheckResult, setDiceRolling, } from "./skill-check-display";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
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
