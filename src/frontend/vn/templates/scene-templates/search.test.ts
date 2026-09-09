// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { searchTemplates, } from "./search";

describe("searchTemplates", () => {
  test("matches scene template by name, case-insensitively", () => {
    const results = searchTemplates("INTRO",);
    expect(results.map((t,) => t.id),).toContain("introduction",);
  });

  test("matches dialogue template by name", () => {
    const results = searchTemplates("whisper",);
    expect(results.map((t,) => t.id),).toContain("dialogue_whisper",);
    expect(results.every((t,) => t.id !== "quiet_moment"),).toBe(true,);
  });

  test("matches by description", () => {
    expect(searchTemplates("suspense",).map((t,) => t.id),).toContain("mystery",);
  });

  test("matches by tag", () => {
    expect(searchTemplates("combat",).map((t,) => t.id),).toContain("combat_start",);
  });

  test("one query can hit both scene and dialogue collections", () => {
    const ids = searchTemplates("tense",).map((t,) => t.id);
    expect(ids,).toContain("confrontation",);
    expect(ids,).toContain("dialogue_tense",);
  });

  test("returns empty array when nothing matches", () => {
    expect(searchTemplates("zzz-no-such-template",),).toEqual([],);
  });

  test("empty query matches every template in both collections", () => {
    const results = searchTemplates("",);
    expect(results.filter((t,) => t.category === "scene").length,).toBeGreaterThan(0,);
    expect(results.filter((t,) => t.category === "dialogue").length,).toBeGreaterThan(0,);
  });
});
