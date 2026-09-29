import { describe, expect, it, } from "bun:test";
import { computeHallucinationConfidence, extractContext, } from "./hallucination-guard/helpers";
import { isKnownEntity, } from "./hallucination-guard/known";
import type { ExtractedEntity, } from "./hallucination-guard/types";

/** */
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

describe("extractContext", () => {
  it("returns the sentence containing the entity", () => {
    expect(extractContext("Alice entered the room. She waved.", "Alice",),).toBe("Alice entered the room",);
  });

  it("returns only the matching sentence, not the whole text", () => {
    const text = "First sentence here. Bob arrived late. Third one.";
    expect(extractContext(text, "Bob",),).toBe("Bob arrived late",);
  });

  it("slices a long sentence to 200 characters", () => {
    const long = "x".repeat(250,);
    const result = extractContext(`Start. ${long} contains Bob.`, "Bob",);

    expect(result,).toHaveLength(200,);
    expect(result,).toBe("x".repeat(200,),);
  });

  it("falls back to text.slice(0, 200) when the entity is not found", () => {
    const text = "a".repeat(300,);
    expect(extractContext(text, "Zorg",),).toBe("a".repeat(200,),);
  });

  it("returns the whole text when shorter than 200 and no match", () => {
    expect(extractContext("short text", "Zorg",),).toBe("short text",);
  });

  it("splits on ! and ? as well as .", () => {
    expect(extractContext("Wow! Bob left? Yes.", "Bob",),).toBe("Bob left",);
  });

  it("trims whitespace around the matched sentence", () => {
    expect(extractContext("  Alice ran.  ", "Alice",),).toBe("Alice ran",);
  });

  it("returns empty string for empty text", () => {
    expect(extractContext("", "Alice",),).toBe("",);
  });
});

describe("computeHallucinationConfidence", () => {
  function entity(name: string, type: ExtractedEntity["type"],): ExtractedEntity {
    return { name, type, };
  }

  it("character entities get 0.8", () => {
    expect(computeHallucinationConfidence(entity("Alice", "character",),),).toBe(0.8,);
  });

  it("location entities get 0.6", () => {
    expect(computeHallucinationConfidence(entity("Riverwood", "location",),),).toBe(0.6,);
  });

  it("item entities get 0.5", () => {
    expect(computeHallucinationConfidence(entity("Sword", "item",),),).toBe(0.5,);
  });

  it("world entities get 0.6", () => {
    expect(computeHallucinationConfidence(entity("Midgard", "world",),),).toBe(0.6,);
  });

  it("unknown type falls back to the 0.7 base confidence", () => {
    const unknown = { name: "X", type: "unknown", } as unknown as ExtractedEntity;
    expect(computeHallucinationConfidence(unknown,),).toBe(0.7,);
  });
});
