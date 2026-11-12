// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the card-payload-in-`settings` helper.
 *
 * The card `tags` and the card `extensions` blob have no column of their own;
 * they ride along in `actors.settings` and are restored on export.
 *
 * Resource contract: pure functions over in-memory strings - no database, no
 * filesystem, no network, no state shared between the cases.
 */
import { describe, expect, test, } from "bun:test";
import { cardExtensions, cardSettings, cardTags, } from "./card-settings";
import type { CanonicalCharacter, } from "./spec";

const card = {
  name: "Aria",
  description: "An elf.",
  personality: "kind",
  appearance: "silver hair",
  default_outfit: "default",
  outfits: [{ id: "default", name: "Default", descriptor: "d", },],
  tags: ["fantasy", "bard",],
  extensions: { depth_prompt: "Speak in verse", },
} as unknown as CanonicalCharacter;

describe("cardSettings", () => {
  test("stores the card tags and extensions", () => {
    const settings = JSON.parse(cardSettings(card,),) as Record<string, unknown>;
    expect(settings.tags,).toEqual(["fantasy", "bard",],);
    expect(settings.extensions,).toEqual({ depth_prompt: "Speak in verse", },);
  });

  test("omits empty payloads", () => {
    const settings = JSON.parse(cardSettings({ name: "Aria", } as CanonicalCharacter,),) as Record<string, unknown>;
    expect(settings,).toEqual({},);
  });
});

describe("cardTags / cardExtensions", () => {
  test("read the payload back", () => {
    const settings = cardSettings(card,);
    expect(cardTags(settings,),).toEqual(["fantasy", "bard",],);
    expect(cardExtensions(settings,),).toEqual({ depth_prompt: "Speak in verse", },);
  });

  test("read nothing from an empty or broken blob", () => {
    expect(cardTags("{}",),).toBeUndefined();
    expect(cardExtensions("{}",),).toBeUndefined();
    expect(cardTags("not json",),).toBeUndefined();
    expect(cardExtensions(null,),).toBeUndefined();
  });

  test("survive a blob that is not an object", () => {
    // The settings column is text, not a contract: a legacy row can hold
    // `null`, an array or a bare string - none of which carry card payload.
    for (const blob of ["null", "[]", '"abc"', "123", "true",]) {
      expect(cardTags(blob,),).toBeUndefined();
      expect(cardExtensions(blob,),).toBeUndefined();
    }
  });

  test("drop tag entries that are not strings", () => {
    expect(cardTags('{"tags":["a",1,null]}',),).toEqual(["a",],);
  });
});
