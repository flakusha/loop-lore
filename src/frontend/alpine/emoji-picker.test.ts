// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Click-to-insert emoji picker slice tests.
 *
 * Exercises the `emojiPicker` method surface (toggle/filter/insert/keyboard
 * paths) with a minimal fake textarea, mirroring slash-autocomplete.test.ts.
 */

import { describe, expect, test, } from "bun:test";
import type { EmojiCandidate, } from "./emoji-autocomplete";
import { filterEmojiCandidates, } from "./emoji-autocomplete";
import { emojiPicker, } from "./emoji-picker";

interface FakeTa {
  value: string;
  selectionStart?: number;
  selectionEnd?: number;
  focused: boolean;
  focus(): void;
}

function makeTa(value: string, cursor?: number,): FakeTa {
  const pos = cursor ?? value.length;
  const ta: FakeTa = {
    value,
    selectionStart: pos,
    selectionEnd: pos,
    focused: false,
    focus: () => {
      ta.focused = true;
    },
  };

  return ta;
}

interface PickerCtx {
  _emojiPickerOpen: boolean;
  _emojiPickerQuery?: string;
  _emojiPickerResults: EmojiCandidate[];
  _emojiPickerActiveIndex: number;
  $refs: { messageInput?: FakeTa };
}

function makeCtx(ta?: FakeTa, query = "",): PickerCtx {
  const ctx = {
    _emojiPickerOpen: false,
    _emojiPickerQuery: query,
    _emojiPickerResults: [] as EmojiCandidate[],
    _emojiPickerActiveIndex: 0,
    $refs: ta ? { messageInput: ta, } : {},
  } as PickerCtx;

  Object.assign(ctx, {
    closeEmojiPicker: emojiPicker.closeEmojiPicker,
    filterEmojiPicker: emojiPicker.filterEmojiPicker,
    insertEmoji: emojiPicker.insertEmoji,
  },);

  return ctx;
}

describe("emojiPicker toggle/close", () => {
  test("toggle opens with the full registry and toggles shut", () => {
    const ctx = makeCtx();

    emojiPicker.toggleEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerOpen,).toBe(true,);
    expect(ctx._emojiPickerResults.length,).toBeGreaterThan(0,);
    expect(ctx._emojiPickerActiveIndex,).toBe(0,);
    emojiPicker.toggleEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerOpen,).toBe(false,);
    expect(ctx._emojiPickerResults,).toEqual([],);
  });

  test("closeEmojiPicker resets query, results and selection", () => {
    const ctx = makeCtx(undefined, "hea",);

    ctx._emojiPickerOpen = true;
    ctx._emojiPickerResults = filterEmojiCandidates("hea",);
    ctx._emojiPickerActiveIndex = 2;
    emojiPicker.closeEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerOpen,).toBe(false,);
    expect(ctx._emojiPickerQuery,).toBe("",);
    expect(ctx._emojiPickerResults,).toEqual([],);
    expect(ctx._emojiPickerActiveIndex,).toBe(0,);
  });
});

describe("emojiPicker filterEmojiPicker", () => {
  test("refines results from the query and resets the selection", () => {
    const ctx = makeCtx(undefined, "HEA",);

    ctx._emojiPickerActiveIndex = 3;
    emojiPicker.filterEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerResults.map((c,) => c.name),).toContain("heart",);
    expect(ctx._emojiPickerActiveIndex,).toBe(0,);
  });

  test("treats a missing query as empty", () => {
    const ctx = makeCtx();

    delete ctx._emojiPickerQuery;
    emojiPicker.filterEmojiPicker!.call(ctx as never,);
    expect(ctx._emojiPickerResults.length,).toBeGreaterThan(0,);
  });
});

describe("emojiPicker insertEmoji", () => {
  test("inserts the shortcode at the cursor and closes the picker", () => {
    const ta = makeTa("hello world", 5,);
    const ctx = makeCtx(ta,);

    ctx._emojiPickerOpen = true;
    emojiPicker.insertEmoji!.call(ctx as never, { name: "heart", emoji: "x", },);
    expect(ta.value,).toBe("hello:heart:  world",);
    expect(ta.selectionStart,).toBe(5 + ":heart: ".length,);
    expect(ta.selectionEnd,).toBe(ta.selectionStart,);
    expect(ta.focused,).toBe(true,);
    expect(ctx._emojiPickerOpen,).toBe(false,);
  });

  test("falls back to the end of input when cursor offsets are missing", () => {
    const ta: FakeTa = { value: "hi", focused: false, focus() {}, };
    const ctx = makeCtx(ta,);

    emojiPicker.insertEmoji!.call(ctx as never, { name: "fire", emoji: "x", },);
    expect(ta.value,).toBe("hi:fire: ",);
  });

  test("no-ops without a composer textarea", () => {
    const ctx = makeCtx();

    expect(() => emojiPicker.insertEmoji!.call(ctx as never, { name: "heart", emoji: "x", },)).not.toThrow();
    expect(ctx._emojiPickerOpen,).toBe(false,);
  });
});

describe("emojiPicker insertEmojiAtIndex / moveEmojiPickerSelection", () => {
  test("insertEmojiAtIndex hydrates empty results before inserting", () => {
    const ta = makeTa("",);
    const ctx = makeCtx(ta,);

    emojiPicker.insertEmojiAtIndex!.call(ctx as never, 0,);
    expect(ta.value,).toContain(":",);
    expect(ctx._emojiPickerOpen,).toBe(false,);
  });

  test("insertEmojiAtIndex ignores an out-of-range index", () => {
    const ta = makeTa("hi",);
    const ctx = makeCtx(ta,);

    ctx._emojiPickerResults = filterEmojiCandidates("hea",);
    emojiPicker.insertEmojiAtIndex!.call(ctx as never, 99,);
    expect(ta.value,).toBe("hi",);
  });

  test("moveEmojiPickerSelection hydrates empty results and wraps", () => {
    const ctx = makeCtx();

    emojiPicker.moveEmojiPickerSelection!.call(ctx as never, 1,);
    const count = ctx._emojiPickerResults.length;

    expect(count,).toBeGreaterThan(0,);
    expect(ctx._emojiPickerActiveIndex,).toBe(1 % count,);
    ctx._emojiPickerActiveIndex = 0;
    emojiPicker.moveEmojiPickerSelection!.call(ctx as never, -1,);
    expect(ctx._emojiPickerActiveIndex,).toBe(count - 1,);
  });
});
