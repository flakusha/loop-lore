// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the binary container parsing seam.
 *
 * A PNG that carries a card chunk and a CHARX bundle must both be read by the
 * card's own shape; a buffer that is neither must be rejected without
 * throwing, so the parser can fall through to the text formats.
 */
import { describe, expect, test, } from "bun:test";
import { createCharx, } from "./charx";
import { parseCharxCard, parsePngCard, } from "./parse-binary";
import { insertCharacterDataIntoPng, } from "./steganography";
import { getMinimalPng, } from "./steganography-png";

const ccv2Data = {
  name: "Aria",
  description: "An elven ranger.",
  personality: "dry",
  appearance: "silver hair",
  scenario: "a border camp",
  first_mmes: "You are not alone out here.",
  mes_example: "<START>\n{{user}}: hi\n{{char}}: hi",
};

describe("parsePngCard", () => {
  test("reads the card embedded in a PNG chunk", () => {
    const png = insertCharacterDataIntoPng(getMinimalPng(), ccv2Data,);
    const warnings: string[] = [];
    const result = parsePngCard(png, warnings,);
    expect(result?.format,).toBe("png-v2",);
    expect(result?.character.name,).toBe("Aria",);
    expect(warnings,).toContain("PNG V2 card detected",);
  });

  test("returns null for a buffer that is not a PNG", () => {
    const warnings: string[] = [];
    expect(parsePngCard(Buffer.from("not a png", "ascii",), warnings,),).toBeNull();
    expect(warnings,).toEqual([],);
  });
});

describe("parseCharxCard", () => {
  test("reads the card and the assets from a bundle", async () => {
    const card = {
      name: "Eldon",
      description: "A wandering wizard",
      personality: "kind",
      appearance: "starlight robes",
      outfits: [{ id: "default", name: "Default", descriptor: "as-is", },],
      tags: [],
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator: "test",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      extensions: {},
    } as unknown as Parameters<typeof createCharx>[0];

    const bundle = await createCharx(card, [{ path: "image/portrait.png", data: getMinimalPng(), },],);
    const warnings: string[] = [];
    const result = await parseCharxCard(bundle, warnings,);
    expect(result?.format,).toBe("charx",);
    expect(result?.character.name,).toBe("Eldon",);
    expect(result?.character.assets?.length,).toBe(1,);
    expect(warnings,).toContain("CHARX bundle with 1 assets",);
  });

  test("returns null and warns for a buffer that is not a bundle", async () => {
    const warnings: string[] = [];
    expect(await parseCharxCard(Buffer.from("not a zip", "ascii",), warnings,),).toBeNull();
    expect(warnings.length,).toBe(1,);
  });
});
