import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderEnvironmentalEffects, } from "./environmental-effects";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("renderEnvironmentalEffects", () => {
  it("returns null for empty", () => {
    expect(renderEnvironmentalEffects([],),).toBeNull();
  });

  it("renders string effects", () => {
    const el = renderEnvironmentalEffects(["rain", "fog",],);
    expect(el!.children,).toHaveLength(2,);
    expect(el!.children[0]!.textContent,).toBe("rain",);
  });

  it("renders object effects", () => {
    const el = renderEnvironmentalEffects([{ name: "wind", description: "gusts", },],);
    expect(el!.children[0]!.getAttribute("title",),).toBe("gusts",);
  });
});
