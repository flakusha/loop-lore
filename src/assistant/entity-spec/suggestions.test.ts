// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { collectEntitySuggestions, ENTITY_SUGGESTION_LIMIT, } from "./suggestions";

describe("collectEntitySuggestions", () => {
  test("scans narration roles only", () => {
    const items = collectEntitySuggestions([
      { role: "user", content: "A stranger named Aldric appears.", },
      { role: "character", content: "They discover a settlement called Ravenhollow.", },
    ],);
    expect(items.map((s,) => s.name),).toEqual(["Ravenhollow",],);
  });

  test("deduplicates by kind + case-insensitive name", () => {
    const items = collectEntitySuggestions([
      { role: "character", content: "A stranger named Aldric appears.", },
      { role: "assistant", content: "Later, a stranger named Aldric returns.", },
    ],);
    expect(items,).toHaveLength(1,);
  });

  test("caps at the suggestion limit", () => {
    const messages = Array.from({ length: 10, }, (_, i,) => ({
      role: "character",
      content: `A stranger named Person${i} appears.`,
    }),);
    expect(collectEntitySuggestions(messages,).length,).toBe(ENTITY_SUGGESTION_LIMIT,);
  });

  test("prefers newest-first input ordering", () => {
    const items = collectEntitySuggestions([
      { role: "character", content: "An amulet called Veyra surfaces.", },
      { role: "character", content: "A stranger named Aldric appears.", },
    ],);
    expect(items[0]!.name,).toBe("Veyra",);
  });
});
