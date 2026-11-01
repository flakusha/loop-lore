import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderActionCost, } from "./action-cost";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("renderActionCost", () => {
  it("returns null when empty", () => {
    expect(renderActionCost({},),).toBeNull();
  });

  it("renders cost and cooldown", () => {
    const el = renderActionCost({ cost: 2, cooldown: 3, },);
    expect(el!.textContent,).toContain("2 AP",);
    expect(el!.textContent,).toContain("3t cooldown",);
  });
});
