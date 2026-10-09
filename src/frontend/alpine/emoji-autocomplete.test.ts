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
import { EMOJI_SHORTCODES, } from "./chat-utils/emoji";
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

describe("emojiAutocomplete popover behavior", () => {
  interface FakeTa {
    tagName: string;
    value: string;
    selectionStart: number;
    selectionEnd: number;
    focused: boolean;
    focus(): void;
  }

  function makeTa(value: string, cursor?: number,): FakeTa {
    const pos = cursor ?? value.length;
    const ta: FakeTa = {
      tagName: "TEXTAREA",
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

  interface EmojiCtx {
    _emojiQuery: string;
    _emojiCandidates: { name: string; emoji: string }[];
    _showEmojiPopover: boolean;
    _emojiActiveIndex: number;
    $refs: { messageInput?: FakeTa };
  }

  function makeCtx(ta?: FakeTa,): EmojiCtx {
    const ctx = {
      _emojiQuery: "",
      _emojiCandidates: [] as { name: string; emoji: string }[],
      _showEmojiPopover: false,
      _emojiActiveIndex: 0,
      $refs: ta ? { messageInput: ta, } : {},
    } as EmojiCtx;

    Object.assign(ctx, {
      hideEmojiPopover: emojiAutocomplete.hideEmojiPopover,
      selectEmojiCandidate: emojiAutocomplete.selectEmojiCandidate,
      acceptEmojiAtIndex: emojiAutocomplete.acceptEmojiAtIndex,
      moveEmojiSelection: emojiAutocomplete.moveEmojiSelection,
    },);

    return ctx;
  }

  function inputEvent(ta: FakeTa,): Event {
    return { target: ta, } as unknown as Event;
  }

  function keyEvent(key: string, target: unknown, extra?: Record<string, unknown>,): {
    event: KeyboardEvent;
    prevented: () => boolean;
  } {
    let stopped = false;
    const event = {
      key,
      target,
      isComposing: false,
      ...extra,
      preventDefault() {
        stopped = true;
      },
    } as unknown as KeyboardEvent;

    return {
      event,
      prevented: () => stopped,
    };
  }

  test("handleEmojiInput opens the popover with filtered candidates", () => {
    const ctx = makeCtx();

    emojiAutocomplete.handleEmojiInput!.call(ctx as never, inputEvent(makeTa("hello :hea",),),);
    expect(ctx._showEmojiPopover,).toBe(true,);
    expect(ctx._emojiQuery,).toBe("hea",);
    expect(ctx._emojiCandidates.map((c,) => c.name),).toContain("heart",);
    expect(ctx._emojiActiveIndex,).toBe(0,);
  });

  test("handleEmojiInput hides the popover when no token is at the caret", () => {
    const ctx = makeCtx();

    ctx._showEmojiPopover = true;
    ctx._emojiCandidates = [{ name: "heart", emoji: "x", },];
    emojiAutocomplete.handleEmojiInput!.call(ctx as never, inputEvent(makeTa("hello",),),);
    expect(ctx._showEmojiPopover,).toBe(false,);
    expect(ctx._emojiCandidates,).toEqual([],);
  });

  test("handleEmojiInput treats a closed shortcode as complete", () => {
    const ctx = makeCtx();

    ctx._showEmojiPopover = true;
    emojiAutocomplete.handleEmojiInput!.call(ctx as never, inputEvent(makeTa("nice :fire:",),),);
    expect(ctx._showEmojiPopover,).toBe(false,);
  });

  test("selectEmojiCandidate replaces the caret token with the shortcode", () => {
    const ta = makeTa("hello :hea",);
    const ctx = makeCtx(ta,);

    emojiAutocomplete.selectEmojiCandidate!.call(ctx as never, { name: "heart", emoji: "x", },);
    expect(ta.value,).toBe("hello :heart: ",);
    expect(ta.selectionStart,).toBe(ta.value.length,);
    expect(ta.focused,).toBe(true,);
    expect(ctx._showEmojiPopover,).toBe(false,);
  });

  test("selectEmojiCandidate no-ops without a textarea or caret token", () => {
    const noTa = makeCtx();

    expect(() => emojiAutocomplete.selectEmojiCandidate!.call(noTa as never, { name: "heart", emoji: "x", },)).not
      .toThrow();

    const ta = makeTa("hello",);
    const ctx = makeCtx(ta,);

    emojiAutocomplete.selectEmojiCandidate!.call(ctx as never, { name: "heart", emoji: "x", },);
    expect(ta.value,).toBe("hello",);
  });

  test("acceptEmojiAtIndex selects the entry or reports a miss", () => {
    const ta = makeTa(":hea",);
    const ctx = makeCtx(ta,);

    ctx._emojiCandidates = filterEmojiCandidates("hea",);
    expect(emojiAutocomplete.acceptEmojiAtIndex!.call(ctx as never, 0,),).toBe(true,);
    expect(ta.value,).toContain(":heart: ",);
    expect(emojiAutocomplete.acceptEmojiAtIndex!.call(ctx as never, 99,),).toBe(false,);
  });

  test("moveEmojiSelection wraps and ignores an empty list", () => {
    const ctx = makeCtx();

    emojiAutocomplete.moveEmojiSelection!.call(ctx as never, 1,);
    expect(ctx._emojiActiveIndex,).toBe(0,);
    ctx._emojiCandidates = filterEmojiCandidates("",);
    const count = ctx._emojiCandidates.length;

    ctx._emojiActiveIndex = count - 1;
    emojiAutocomplete.moveEmojiSelection!.call(ctx as never, 1,);
    expect(ctx._emojiActiveIndex,).toBe(0,);
    emojiAutocomplete.moveEmojiSelection!.call(ctx as never, -1,);
    expect(ctx._emojiActiveIndex,).toBe(count - 1,);
  });

  test("handleEmojiKeydown ignores non-textarea, composing, and closed popovers", () => {
    const ctx = makeCtx();
    const ta = makeTa(":hea",);
    const { event: div, } = keyEvent("Tab", { tagName: "DIV", },);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, div,);
    const { event: composing, } = keyEvent("Tab", ta, { isComposing: true, },);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, composing,);
    const { event: closed, } = keyEvent("Tab", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, closed,);
    expect(ctx._showEmojiPopover,).toBe(false,);
  });

  test("handleEmojiKeydown closes an empty popover on Escape only", () => {
    const ta = makeTa(":zzz-no-match",);
    const ctx = makeCtx(ta,);

    ctx._showEmojiPopover = true;
    ctx._emojiCandidates = [];
    const { event: other, prevented, } = keyEvent("a", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, other,);
    expect(ctx._showEmojiPopover,).toBe(true,);
    expect(prevented(),).toBe(false,);
    const { event: esc, } = keyEvent("Escape", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, esc,);
    expect(ctx._showEmojiPopover,).toBe(false,);
  });

  test("handleEmojiKeydown Tab accepts, arrows move, Escape hides", () => {
    const ta = makeTa("hi :hea",);
    const ctx = makeCtx(ta,);

    ctx._showEmojiPopover = true;
    ctx._emojiCandidates = filterEmojiCandidates("hea",);
    const { event: tab, prevented, } = keyEvent("Tab", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, tab,);
    expect(prevented(),).toBe(true,);
    expect(ta.value,).toContain(":heart: ",);
    ctx._showEmojiPopover = true;
    ctx._emojiCandidates = filterEmojiCandidates("",);
    const { event: down, } = keyEvent("ArrowDown", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, down,);
    expect(ctx._emojiActiveIndex,).toBe(1,);
    const { event: up, } = keyEvent("ArrowUp", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, up,);
    expect(ctx._emojiActiveIndex,).toBe(0,);
    const { event: esc, } = keyEvent("Escape", ta,);

    emojiAutocomplete.handleEmojiKeydown!.call(ctx as never, esc,);
    expect(ctx._showEmojiPopover,).toBe(false,);
  });

  test("handleEmojiEnter consumes Enter only when the popover has candidates", () => {
    const closed = makeCtx();

    expect(emojiAutocomplete.handleEmojiEnter!.call(closed as never,),).toBe(false,);
    const empty = makeCtx();

    empty._showEmojiPopover = true;
    expect(emojiAutocomplete.handleEmojiEnter!.call(empty as never,),).toBe(false,);
    const ta = makeTa(":hea",);
    const ctx = makeCtx(ta,);

    ctx._showEmojiPopover = true;
    ctx._emojiCandidates = filterEmojiCandidates("hea",);
    expect(emojiAutocomplete.handleEmojiEnter!.call(ctx as never,),).toBe(true,);
    expect(ta.value,).toContain(":heart: ",);
  });
});
