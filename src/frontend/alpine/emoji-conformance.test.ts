// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emoji conformance vectors — the ONE shared fixture both clients run.
 *
 * `native/loop-lore-egui/emoji-vectors.json` is frozen output of the htmx
 * renderer/autocomplete; the Rust crate's `emoji.rs` tests assert against the
 * same file, so any drift between the two clients fails on whichever side
 * moved. This suite pins the TS half of that contract.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { EMOJI_SHORTCODES, renderShortcodes, } from "./chat-utils/emoji";
import {
  extractEmojiQuery,
  filterEmojiCandidates,
  findEmojiCaretToken,
} from "./emoji-autocomplete";

interface Vectors {
  registry: { name: string; emoji: string }[];
  render: { input: string; expected: string }[];
  autocomplete: { text: string; cursor: number; expectedQuery: string | null; expectedCandidates: string[] }[];
  insert: { text: string; cursor: number; candidate: string; expectedText: string; expectedCaret: number }[];
}

const VECTORS: Vectors = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../native/loop-lore-egui/emoji-vectors.json",), "utf8",),
) as Vectors;

describe("emoji conformance vectors", () => {
  test("registry matches the vectors exactly (order included)", () => {
    expect(Object.entries(EMOJI_SHORTCODES,).map(([name, emoji,],) => ({ name, emoji, })),).toEqual(VECTORS.registry,);
  });

  test("render output matches every vector", () => {
    for (const { input, expected, } of VECTORS.render) {
      expect(renderShortcodes(input,),).toBe(expected,);
    }
  });

  test("autocomplete query + candidates match every vector", () => {
    for (const { text, cursor, expectedQuery, expectedCandidates, } of VECTORS.autocomplete) {
      const before = text.slice(0, cursor,);
      const query = extractEmojiQuery(before,);

      expect(query,).toBe(expectedQuery,);
      const candidates = query === null ? [] : filterEmojiCandidates(query,).map((c,) => c.name);

      expect(candidates,).toEqual(expectedCandidates,);
    }
  });

  test("candidate insert matches every vector", () => {
    for (const { text, cursor, candidate, expectedText, expectedCaret, } of VECTORS.insert) {
      const before = text.slice(0, cursor,);
      const after = text.slice(cursor,);
      const match = findEmojiCaretToken(before,);

      expect(match,).not.toBeNull();
      const matched = match![0];
      const trimmed = matched.trimStart();
      const sep = matched.slice(0, matched.length - trimmed.length,);
      const newBefore = before.slice(0, match!.index,) + sep + `:${candidate}: `;

      expect(newBefore + after,).toBe(expectedText,);
      expect(newBefore.length,).toBe(expectedCaret,);
    }
  });
});
