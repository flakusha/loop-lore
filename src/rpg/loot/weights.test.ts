import { describe, expect, it, } from "bun:test";
import { RARITY_WEIGHTS, } from "./weights";

describe("rpg/loot/weights (real logic)", () => {
  it("common has highest weight", () => {
    expect(RARITY_WEIGHTS.common,).toBeGreaterThan(RARITY_WEIGHTS.rare,);
    expect(RARITY_WEIGHTS.artifact,).toBeLessThan(RARITY_WEIGHTS.common,);
  });
  it("all rarities defined", () => {
    const keys = ["common", "uncommon", "rare", "epic", "legendary", "unique", "artifact",] as const;
    for (const k of keys) {
      expect(typeof RARITY_WEIGHTS[k],).toBe("number",);
    }
  });
});
