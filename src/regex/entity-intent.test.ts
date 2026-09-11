// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  buildEntitySeed,
  detectStoryEntityIntroductions,
} from "./entity-intent";

describe("detectStoryEntityIntroductions", () => {
  test("detects a named stranger as a character", () => {
    const text = "The door creaks. A hooded stranger named Aldric asks for lodging.";
    const found = detectStoryEntityIntroductions(text,);
    expect(found.length,).toBeGreaterThan(0,);
    const hit = found.find((f,) => f.kind === "character")!;
    expect(hit.name,).toBe("Aldric",);
  });

  test("detects a direct character entrance", () => {
    const text = "Mira, a weathered scout, enters the campfire light.";
    const found = detectStoryEntityIntroductions(text,);
    const hit = found.find((f,) => f.kind === "character");
    expect(hit,).toBeDefined();
    expect(hit!.name,).toBe("Mira",);
  });

  test("detects a location introduction", () => {
    const text = "By dusk they discover a settlement called Ravenhollow.";
    const found = detectStoryEntityIntroductions(text,);
    const hit = found.find((f,) => f.kind === "location");
    expect(hit,).toBeDefined();
    expect(hit!.name,).toBe("Ravenhollow",);
  });

  test("detects an item introduction", () => {
    const text = "The merchant hands over a blade named Duskbringer.";
    const found = detectStoryEntityIntroductions(text,);
    const hit = found.find((f,) => f.kind === "item");
    expect(hit,).toBeDefined();
    expect(hit!.name,).toBe("Duskbringer",);
  });

  test("plain narration with no introductions yields nothing", () => {
    expect(detectStoryEntityIntroductions("They walk on through the forest.",),).toEqual([],);
  });

  test("results are ordered by position in the text", () => {
    const text = "A stranger named Aldric appears. Later they find an amulet called Veyra. They rest.";
    const found = detectStoryEntityIntroductions(text,);
    const indexes = found.map((f,) => f.index);
    expect([...indexes,].sort((a, b,) => a - b),).toEqual(indexes,);
  });
});

describe("buildEntitySeed", () => {
  test("uses the detected name and surrounding context", () => {
    const text = "A stranger named Aldric asks for lodging.";
    const intro = detectStoryEntityIntroductions(text,)[0]!;
    const seed = buildEntitySeed(intro, text,);
    expect(seed,).toContain("Aldric",);
    expect(seed,).toContain("asks for lodging",);
  });

  test("empty names fall back to a placeholder", () => {
    const seed = buildEntitySeed(
      { kind: "character", name: "", context: "someone arrives", index: 0, },
      "someone arrives",
    );
    expect(seed,).toContain("(name unknown)",);
  });
});
