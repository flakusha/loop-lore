// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the Agnai native character normalizer.
 *
 * The native JSON carries no `spec` wrapper, so it used to be read as a
 * Character.AI card and lost the persona bag, sampleChat, scenario and
 * extensions.
 */
import { describe, expect, test, } from "bun:test";
import { isAgnaiNative, normalizeAgnai, } from "./agnai";

/** The rendered persona text, mirroring upstream `formatCharacter`. */
const PERSONA_TEXT = "Name: Aria\nspecies: elf";

const nativeCard = {
  kind: "character",
  name: "Aria",
  description: "Notes from the author",
  appearance: "Silver hair, sharp eyes",
  persona: {
    kind: "attributes",
    attributes: { species: ["elf",], },
  },
  greeting: "Greetings, traveller",
  sampleChat: "{{user}}: hi - {{char}}: hello",
  scenario: "A tavern at dusk",
  systemPrompt: "Stay in character",
  postHistoryInstructions: "Keep it short",
  alternateGreetings: ["Ah, there you are",],
  tags: ["fantasy", "bard",],
  creator: "Aria's author",
  characterVersion: "3",
  culture: "elves",
  insert: { depth: 4, prompt: "Speak in verse", },
  characterBook: {
    name: "Aria's lore",
    entries: [
      { name: "Song", entry: "She sings ballads", keywords: ["song",], priority: 10, weight: 5, enabled: true, },
    ],
  },
  extensions: { depth_prompt: { prompt: "Speak in verse", depth: 4, }, },
};

describe("isAgnaiNative", () => {
  test("recognizes a native character", () => {
    expect(isAgnaiNative(nativeCard,),).toBe(true,);
  });

  test("rejects a card without a persona bag", () => {
    expect(isAgnaiNative({ name: "A", description: "d", greeting: "hi", },),).toBe(false,);
  });

  test("rejects a Character.AI card", () => {
    expect(isAgnaiNative({ name: "A", description: "d", greeting: "hi", definition: "x", },),).toBe(false,);
  });
});

describe("normalizeAgnai", () => {
  test("maps the native fields onto the canonical card", () => {
    const result = normalizeAgnai(nativeCard,);
    expect(result.name,).toBe("Aria",);
    expect(result.description,).toBe(PERSONA_TEXT,);
    expect(result.creator_notes,).toBe("Notes from the author",);
    expect(result.appearance,).toBe("Silver hair, sharp eyes",);
    expect(result.welcome_message,).toBe("Greetings, traveller",);
    expect(result.mes_example,).toBe("{{user}}: hi - {{char}}: hello",);
    expect(result.scenario,).toBe("A tavern at dusk",);
    expect(result.system_prompt,).toBe("Stay in character",);
    expect(result.post_history_instructions,).toBe("Keep it short",);
    expect(result.alternate_greetings,).toEqual(["Ah, there you are",],);
    expect(result.tags,).toEqual(["fantasy", "bard",],);
    expect(result.creator,).toBe("Aria's author",);
    expect(result.character_version,).toBe("3",);
    expect(result.culture,).toBe("elves",);
  });

  test("keeps the persona bag and the depth prompt in the extensions", () => {
    const result = normalizeAgnai(nativeCard,);
    const extensions = result.extensions as Record<string, unknown>;
    expect(extensions.depth_prompt,).toBe("Speak in verse",);
    const agnai = extensions.agnai as Record<string, unknown>;
    expect(agnai.persona,).toEqual(nativeCard.persona,);
    expect(agnai.appearance,).toBe("Silver hair, sharp eyes",);
  });

  test("maps the native memory book onto a card lorebook", () => {
    const result = normalizeAgnai(nativeCard,);
    expect(result.lorebook?.entries,).toHaveLength(1,);
    const entry = result.lorebook?.entries[0];
    expect(entry?.keys,).toEqual(["song",],);
    expect(entry?.content,).toBe("She sings ballads",);
    expect(entry?.insertion_order,).toBe(5,);
    expect(entry?.priority,).toBe(10,);
  });

  test("keeps the name when the persona bag carries no attributes", () => {
    const result = normalizeAgnai({ ...nativeCard, persona: { kind: "attributes", attributes: {}, }, },);
    expect(result.description,).toBe("Name: Aria",);
  });

  test("falls back to the description when the card has no appearance", () => {
    const result = normalizeAgnai({ ...nativeCard, appearance: undefined, },);
    expect(result.appearance,).toBe(PERSONA_TEXT,);
    expect(result.personality,).toBe(PERSONA_TEXT,);
    expect(result.default_outfit,).toBe("default",);
    expect(result.outfits,).toHaveLength(1,);
  });
});
