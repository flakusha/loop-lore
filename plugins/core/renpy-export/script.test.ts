// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py script generator tests — labels, dialogue, menus, stub labels,
 * slug dedup, and escaping. Pure builder: no DB, no filesystem.
 */
import { describe, expect, test, } from "bun:test";
import { buildProjectFiles, escapeRenpy, slugify, uniqueSlugs, } from "./script";
import type { RenpyExportModel, } from "./types";

const MODEL: RenpyExportModel = {
  chats: [
    {
      label: "chat_tavern",
      name: "Tavern",
      messages: [
        { speaker: "aria", text: "Welcome in." },
        { speaker: "", text: "The door creaks." },
        { speaker: "aria", text: 'She says "stay".' },
      ],
      stubs: [{ label: "Sneak past", target: "chat_tavern_stub_1", }],
    },
  ],
  characters: [{ slug: "aria", displayName: "Aria", assetId: "a1", }],
  images: new Map(),
};

describe("slugify", () => {
  test("lowercases and underscores", () => {
    expect(slugify("Aria Stark!"),).toBe("aria_stark",);
  },);

  test("falls back for empty", () => {
    expect(slugify("!!!"),).toBe("unnamed",);
  },);

  test("caps length", () => {
    expect(slugify("a".repeat(100),).length,).toBeLessThanOrEqual(40,);
  },);
},);

describe("uniqueSlugs", () => {
  test("dedups with suffixes", () => {
    expect(uniqueSlugs(["Aria", "Aria", "Aria!",]),).toEqual(["aria", "aria_2", "aria_3",],);
  },);
},);

describe("escapeRenpy", () => {
  test("escapes quotes, backslashes, newlines", () => {
    expect(escapeRenpy('a"b\\c\nd'),).toBe('a\\"b\\\\c\\nd',);
  },);
},);

describe("buildProjectFiles", () => {
  test("emits a working start label calling each chat", () => {
    const files = buildProjectFiles(MODEL,);
    expect(files["game/script.rpy"],).toContain("label start:",);
    expect(files["game/script.rpy"],).toContain("    call chat_tavern",);
  },);

  test("renders dialogue with named speakers and narration", () => {
    const script = buildProjectFiles(MODEL,)["game/script.rpy"] ?? "";
    expect(script,).toContain('    aria "Welcome in."',);
    expect(script,).toContain('    "The door creaks."',);
    expect(script,).toContain('    aria "She says \\"stay\\"."',);
  },);

  test("renders fork menus that jump to stub labels with TODOs", () => {
    const script = buildProjectFiles(MODEL,)["game/script.rpy"] ?? "";
    expect(script,).toContain("    menu:",);
    expect(script,).toContain('        "Sneak past":',);
    expect(script,).toContain("            jump chat_tavern_stub_1",);
    expect(script,).toContain("label chat_tavern_stub_1:",);
    expect(script,).toContain("# TODO: author",);
  },);

  test("defines characters with display names and image refs", () => {
    const chars = buildProjectFiles(MODEL,)["game/characters.rpy"] ?? "";
    expect(chars,).toContain('define aria = Character("Aria", image="images/aria.png")',);
  },);

  test("omits image ref when no avatar", () => {
    const chars = buildProjectFiles(
      { ...MODEL, characters: [{ slug: "bob", displayName: "Bob", assetId: null, }], },
    )["game/characters.rpy"] ?? "";
    expect(chars,).toContain('define bob = Character("Bob")',);
    expect(chars,).not.toContain("images/bob",);
  },);

  test("never leaves 3+ blank runs", () => {
    const script = buildProjectFiles(MODEL,)["game/script.rpy"] ?? "";
    expect(script,).not.toContain("\n\n\n",);
  },);

  test("README explains the overlay flow", () => {
    expect(buildProjectFiles(MODEL,)["README.md"],).toContain("Ren'Py Launcher",);
  },);
},);
