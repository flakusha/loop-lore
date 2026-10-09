// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emoji autocomplete + picker tests (split from slash-autocomplete.ts).
 *
 * Covers the pure query/filter helpers directly and the `emojiAutocomplete`
 * / `emojiPicker` slices through their public method surface, mirroring
 * slash-autocomplete.test.ts style (minimal fake textarea).
 */

import { describe, expect, test, } from "bun:test";
import { EMOJI_SHORTCODES, } from "./chat-utils/render";
import {
  didYouMeanCandidate,
  editDistance,
  emojiAutocomplete,
  emojiTokenRe,
  extractEmojiQuery,
  filterEmojiCandidates,
  findEmojiCaretToken,
} from "./emoji-autocomplete";
import { emojiPicker, } from "./emoji-picker";

describe("emojiTokenRe", () => {
  test("matches a caret-anchored token", () => {
    expect(emojiTokenRe.test("hello :hea",),).toBe(true,);
    expect(emojiTokenRe.test("no-token",),).toBe(false,);
  });
});

describe("findEmojiCaretToken", () => {
  test("returns the caret-anchored match with its capture", () => {
    const match = findEmojiCaretToken("hello :HEA",);

    expect(match?.[1],).toBe("HEA",);
  });

  test("returns null when the token is not at the caret", () => {
    expect(findEmojiCaretToken("hello",),).toBeNull();
    expect(findEmojiCaretToken(":fire: done",),).toBeNull();
  });
});

describe("extractEmojiQuery", () => {
  test("returns the lowercase query without the colon", () => {
    expect(extractEmojiQuery("hello :HEA",),).toBe("hea",);
  });

  test("returns null when no token is at the caret", () => {
    expect(extractEmojiQuery("hello",),).toBeNull();
  });

  test("treats a closed shortcode as complete, not a query", () => {
    expect(extractEmojiQuery("nice :fire:",),).toBeNull();
  });
});

describe("filterEmojiCandidates", () => {
  test("empty query returns the full registry", () => {
    expect(filterEmojiCandidates("",).length,).toBeGreaterThan(0,);
  });

  test("filters by case-insensitive substring", () => {
    const names = filterEmojiCandidates("HEART",).map((c,) => c.name);

    expect(names,).toContain("heart",);
  });
});

describe("EMOJI_SHORTCODES", () => {
  test("registry is non-empty and maps to glyphs", () => {
    expect(Object.keys(EMOJI_SHORTCODES,).length,).toBeGreaterThan(0,);
    expect(EMOJI_SHORTCODES.heart,).toBe("\u2764\uFE0F",);
  });
});

describe("editDistance / didYouMeanCandidate", () => {
  test("identical strings have distance 0", () => {
    expect(editDistance("roll", "roll",),).toBe(0,);
  });

  test("suggests the closest registry name within distance 2", () => {
    expect(didYouMeanCandidate(["roll", "help",], "rol",),).toBe("roll",);
    expect(didYouMeanCandidate(["roll", "help",], "zzz",),).toBeNull();
  });
});

describe("emojiAutocomplete slice", () => {
  test("exposes the popover surface merged in bootstrap", () => {
    for (const key of ["handleEmojiInput", "selectEmojiCandidate", "hideEmojiPopover", "handleEmojiEnter",] as const) {
      expect(typeof emojiAutocomplete[key],).toBe("function",);
    }
  });

  test("hideEmojiPopover resets popover state", () => {
    const ctx = {
      _showEmojiPopover: true,
      _emojiActiveIndex: 2,
      _emojiQuery: "hea",
      _emojiCandidates: [{ name: "heart", emoji: "x", },],
    };

    emojiAutocomplete.hideEmojiPopover!.call(ctx as never,);
    expect(ctx._showEmojiPopover,).toBe(false,);
    expect(ctx._emojiCandidates,).toEqual([],);
  });
});

describe("emojiPicker slice", () => {
  test("toggle opens with the full registry, close resets", () => {
    const ctx = {
      _emojiPickerOpen: false,
      _emojiPickerQuery: "",
      _emojiPickerResults: [],
      _emojiPickerActiveIndex: 0,
    };

    Object.assign(ctx, {
      closeEmojiPicker: emojiPicker.closeEmojiPicker,
      filterEmojiPicker: emojiPicker.filterEmojiPicker,
    },);

    emojiPicker.toggleEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerOpen,).toBe(true,);
    expect(ctx._emojiPickerResults.length,).toBeGreaterThan(0,);
    emojiPicker.closeEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerOpen,).toBe(false,);
  });
});
