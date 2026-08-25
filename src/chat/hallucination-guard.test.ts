import { describe, expect, it, } from "bun:test";
import { isKnownEntity, } from "./hallucination-guard/known";

function known() {
  return {
    actors: new Set(["alice", "bob",],),
    locations: new Set(["riverwood",],),
    items: new Set(["sword",],),
    worlds: new Set(["midgard",],),
  };
}

describe("isKnownEntity (B2: dynamic/transient entities)", () => {
  it("matches a DB-known actor", () => {
    expect(isKnownEntity("Alice", known(), [], [],),).toBe(true,);
  });

  it("flags an unknown entity without allowlist", () => {
    expect(isKnownEntity("Zorgath", known(), [], [],),).toBe(false,);
  });

  it("treats allowedNames as known (transient/dynamic session entities)", () => {
    const allowed = new Set(["zorgath", "the glowing door",],);
    expect(isKnownEntity("Zorgath", known(), [], [], allowed,),).toBe(true,);
    expect(isKnownEntity("The Glowing Door", known(), [], [], allowed,),).toBe(true,);
  });

  it("does not flag unknown when allowlist is empty/unrelated", () => {
    const allowed = new Set(["zorgath",],);
    expect(isKnownEntity("Mordak", known(), [], [], allowed,),).toBe(false,);
  });
});
