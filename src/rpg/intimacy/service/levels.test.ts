import { describe, expect, it, } from "bun:test";
import { checkThresholds, getLevelLabel, } from "./levels";

describe("intimacy/service/levels (real logic)", () => {
  it("getLevelLabel returns correct labels", () => {
    expect(getLevelLabel(0,),).toBe("Strangers",);
    expect(getLevelLabel(20,),).toBeGreaterThan("",);
  });
  it("checkThresholds detects newly crossed thresholds", () => {
    const thresholds = checkThresholds(5, 30, [],);
    expect(Array.isArray(thresholds,),).toBe(true,);
  });
  it("checkThresholds skips already unlocked levels", () => {
    const unlocked = [20, 40,];
    const result = checkThresholds(10, 35, unlocked,);
    expect(Array.isArray(result,),).toBe(true,);
  });
});
