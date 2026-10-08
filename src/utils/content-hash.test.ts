// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { contentHash, dedupeByHash, } from "./content-hash";

describe("contentHash", () => {
  test("is stable, 8-hex, and sensitive to order", () => {
    expect(contentHash("fact",),).toBe(contentHash("fact",),);
    expect(contentHash("fact",),).toMatch(/^[0-9a-f]{8}$/,);
    // A and B reordered must not collide: the assembler merges by hash, so an
    // order-insensitive digest would silently drop a distinct fact.
    expect(contentHash("ab",),).not.toBe(contentHash("ba",),);
  });

  test("hashes unicode by code point, not by char code", () => {
    expect(contentHash("é",),).toBe(contentHash("é",),);
    expect(contentHash("é",),).not.toBe(contentHash("e",),);
  });
});

describe("dedupeByHash", () => {
  interface Entry {
    source: string;
    id: string;
    content: string;
  }

  const key = (e: Entry,) => e.content;
  const entry = (source: string, id: string, content: string,): Entry => ({ source, id, content, });

  test("keeps the first occurrence and reports the later ones as duplicates", () => {
    const a1 = entry("carriage", "a1", "the user likes tea",);
    const b1 = entry("notes", "b1", "the user likes tea",);
    const c1 = entry("quests", "c1", "the user hates coffee",);

    const { unique, duplicates, } = dedupeByHash([a1, b1, c1,], key,);

    // Source priority is positional: the first system to supply a fact wins.
    expect(unique,).toEqual([a1, c1,],);
    expect(duplicates,).toHaveLength(1,);
    expect(duplicates[0]!.entry,).toBe(b1,);
    expect(duplicates[0]!.hash,).toBe(contentHash("the user likes tea",),);
    // firstIndex points at the kept row, not at the source array position.
    expect(duplicates[0]!.firstIndex,).toBe(0,);
  });

  test("drops a later duplicate even when the surrounding fields differ", () => {
    // Same fact, different provenance: only the hashed content decides.
    const { unique, duplicates, } = dedupeByHash([entry("carriage", "a1", "x",), entry("notes", "b7", "x",),], key,);

    expect(unique.map((e,) => e.id),).toEqual(["a1",],);
    expect(duplicates[0]!.entry.id,).toBe("b7",);
  });

  test("is a partition: every input lands in exactly one output list", () => {
    const entries = [
      entry("carriage", "a1", "one",),
      entry("notes", "b1", "one",),
      entry("notes", "b2", "two",),
      entry("quests", "c1", "one",),
      entry("quests", "c2", "three",),
    ];

    const { unique, duplicates, } = dedupeByHash(entries, key,);

    expect(unique.length + duplicates.length,).toBe(entries.length,);
    expect(unique,).toHaveLength(3,);
    // Both later "one" copies point at the single kept row (index 0), not at
    // their own source position.
    expect(duplicates.map((d,) => d.firstIndex),).toEqual([0, 0,],);
    expect(duplicates.every((d,) => d.hash === contentHash("one",)),).toBe(true,);
  });

  test("handles empty and all-duplicate inputs without inventing rows", () => {
    expect(dedupeByHash([], key,),).toEqual({ unique: [], duplicates: [], },);

    const dup = entry("carriage", "a1", "same",);
    const { unique, duplicates, } = dedupeByHash([dup, dup, dup,], key,);
    expect(unique,).toEqual([dup,],);
    expect(duplicates.map((d,) => d.firstIndex),).toEqual([0, 0,],);
  });

  test("keys on the selector, not the whole entry", () => {
    // Two entries differing only in `id` dedupe when keyed on content, and
    // survive when keyed on content+id — the selector is the only lever.
    const a = entry("carriage", "a1", "same",);
    const b = entry("notes", "b1", "same",);
    expect(dedupeByHash([a, b,], key,).unique,).toHaveLength(1,);
    expect(dedupeByHash([a, b,], (e,) => `${e.source}:${e.id}`,).unique,).toHaveLength(2,);
  });
});
