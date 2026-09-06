import { describe, expect, it, } from "bun:test";
import { checkThresholds, getLevelLabel, } from "./levels";

describe("intimacy/service/levels (real logic)", () => {
  it("getLevelLabel returns non-empty string for any score", () => {
    expect(getLevelLabel(0,),).toBeTruthy();
    expect(typeof getLevelLabel(100,),).toBe("string",);
  });
  it("getLevelLabel returns distinct labels for different scores", () => {
    expect(getLevelLabel(0,),).not.toBe(getLevelLabel(100,),);
  });
  it("checkThresholds returns array", () => {
    expect(Array.isArray(checkThresholds(5, 30, [],),),).toBe(true,);
  });
  it("checkThresholds skips already unlocked levels", () => {
    expect(Array.isArray(checkThresholds(10, 35, [20, 40,],),),).toBe(true,);
  });
});
