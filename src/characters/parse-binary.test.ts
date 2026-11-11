// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the binary container parsing seam.
 *
 * A buffer that is neither a PNG with a card chunk nor a CHARX bundle must be
 * rejected without throwing, so the parser can fall through to the text
 * formats.
 */
import { describe, expect, test, } from "bun:test";
import { parseCharxCard, parsePngCard, } from "./parse-binary";

describe("parsePngCard", () => {
  test("returns null for a buffer that is not a PNG", () => {
    const warnings: string[] = [];
    expect(parsePngCard(Buffer.from("not a png", "ascii",), warnings,),).toBeNull();
    expect(warnings,).toEqual([],);
  });
});

describe("parseCharxCard", () => {
  test("returns null and warns for a buffer that is not a bundle", async () => {
    const warnings: string[] = [];
    expect(await parseCharxCard(Buffer.from("not a zip", "ascii",), warnings,),).toBeNull();
    expect(warnings.length,).toBe(1,);
  });
});
