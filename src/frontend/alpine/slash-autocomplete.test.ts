// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Slash-command autocomplete tests.
 *
 * Mirrors chat-group.test.ts style: minimal fake textarea, ctx wired with
 * only the fields the methods touch, keyboard events that record whether
 * `preventDefault()` ran. Pure helpers (`extractSlashQuery`,
 * `filterSlashCandidates`) are exercised directly; the Alpine state slice
 * is exercised through the public method surface.
 */

import { describe, expect, test, } from "bun:test";
import { slashAutocomplete, } from "./slash-autocomplete";
import {
  didYouMeanCandidate,
  editDistance,
  extractSlashQuery,
  filterSlashCandidates,
  findCaretToken,
  slashTokenRe,
} from "./slash-query";

interface FakeTextarea {
  tagName: string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus(): void;
}

interface SlashCtx {
  _slashQuery: string;
  _slashCandidates: { name: string; description: string; descriptionKey: string }[];
  _showSlashPopover: boolean;
  _slashActiveIndex: number;
  _commandList: { name: string; description: string; descriptionKey: string }[];
  $refs: { messageInput: FakeTextarea };
}

function makeTextarea(value: string, cursor?: number,): FakeTextarea {
  const pos = cursor ?? value.length;
  return { tagName: "TEXTAREA", value, selectionStart: pos, selectionEnd: pos, focus() {}, };
}

function buildCtx(
  list: { name: string; description: string; descriptionKey: string }[],
  ta: FakeTextarea,
): SlashCtx {
  return {
    _slashQuery: "",
    _slashCandidates: [],
    _showSlashPopover: false,
    _slashActiveIndex: 0,
    _commandList: list.map((entry,) => ({ ...entry, })),
    $refs: { messageInput: ta, },
  };
}

function wire(ctx: SlashCtx,): void {
  Object.assign(ctx, {
    handleSlashInput: slashAutocomplete.handleSlashInput,
    selectSlashCandidate: slashAutocomplete.selectSlashCandidate,
    hideSlashPopover: slashAutocomplete.hideSlashPopover,
    acceptSlashAtIndex: slashAutocomplete.acceptSlashAtIndex,
    moveSlashSelection: slashAutocomplete.moveSlashSelection,
    handleSlashKeydown: slashAutocomplete.handleSlashKeydown,
    handleSlashEnter: slashAutocomplete.handleSlashEnter,
  },);
}

function keyEvent(
  key: string,
  target: FakeTextarea,
  shiftKey = false,
): { event: KeyboardEvent; prevented: () => boolean } {
  let stopped = false;
  const event = {
    key,
    shiftKey,
    target,
    preventDefault() {
      stopped = true;
    },
  } as unknown as KeyboardEvent;

  return { event, prevented: () => stopped, };
}

const commandFixtures = [
  { name: "help", description: "d-help", descriptionKey: "commands.help", },
  { name: "improve", description: "d-improve", descriptionKey: "commands.improve", },
  { name: "impersonate", description: "d-impersonate", descriptionKey: "commands.impersonate", },
  { name: "image", description: "d-image", descriptionKey: "commands.image", },
  { name: "roll", description: "d-roll", descriptionKey: "commands.roll", },
];

// ── Pure helpers ─────────────────────────────────────────────

describe("findCaretToken", () => {
  test("returns the token that ends at the caret, with its leading separator", () => {
    const m = findCaretToken("say /he",);
    expect(m,).not.toBeNull();
    expect(m![0],).toBe(" /he",);
    expect(m![1],).toBe("he",);
    expect(m!.index,).toBe(3,);
  });

  test("matches a bare slash at the caret", () => {
    const m = findCaretToken("hi /",);
    expect(m,).not.toBeNull();
    expect(m![1],).toBeUndefined();
  });

  test("returns null when the token does not end at the caret", () => {
    // `/cmd args` fully typed — the caret is past the token, so interception
    // must not fire; the same reason the whole-text regex alone is unusable.
    expect(findCaretToken("/cmd args",),).toBeNull();
    expect(findCaretToken("no slash here",),).toBeNull();
    // A slash glued to a word (URL path, email) never starts a token.
    expect(findCaretToken("http://x/y",),).toBeNull();
  });

  test("is stateless across calls (the shared regex carries no lastIndex)", () => {
    const text = "a /one b /two";
    expect(findCaretToken(text,)![1],).toBe("two",);
    expect(findCaretToken(text,)![1],).toBe("two",);
    expect(slashTokenRe.lastIndex,).toBe(0,);
  });
});

describe("extractSlashQuery", () => {
  test("captures a multi-character prefix at start of string", () => {
    expect(extractSlashQuery("/im",),).toBe("im",);
  });

  test("captures after whitespace so email-like text does not trigger", () => {
    expect(extractSlashQuery("say /he",),).toBe("he",);
    expect(extractSlashQuery("email/foo@bar",),).toBeNull();
  });

  test("returns null when the token does not end at the caret", () => {
    // A fully typed `/cmd args` must not intercept Enter — send normally.
    expect(extractSlashQuery("/cmd args",),).toBeNull();
    expect(extractSlashQuery("say /he to me",),).toBeNull();
    expect(extractSlashQuery("/improve prompt here",),).toBeNull();
  });

  test("multi-token input only matches a token ending at the caret", () => {
    expect(extractSlashQuery("/old /new",),).toBe("new",);
    expect(extractSlashQuery("/roll ",),).toBeNull();
    expect(extractSlashQuery("/roll 2d6 ",),).toBeNull();
  });

  test("returns empty string for a bare slash and null when no token", () => {
    expect(extractSlashQuery("/",),).toBe("",);
    expect(extractSlashQuery("hello world",),).toBeNull();
    expect(extractSlashQuery("http://example.com",),).toBeNull();
  });
});

describe("filterSlashCandidates", () => {
  const names = ["help", "improve", "impersonate", "image", "roll",];

  test("returns full list in registry order for an empty query", () => {
    expect(filterSlashCandidates(names, "",),).toEqual(names,);
  });

  test("filters by substring case-insensitively in registry order", () => {
    expect(filterSlashCandidates(names, "im",),).toEqual(["improve", "impersonate", "image",],);
    expect(filterSlashCandidates(names, "IM",),).toEqual(["improve", "impersonate", "image",],);
  });

  test("returns an empty array when no candidate matches", () => {
    expect(filterSlashCandidates(names, "zzz",),).toEqual([],);
  });

  test("falls back to the closest name for a near-miss typo", () => {
    expect(filterSlashCandidates(names, "hep",),).toEqual(["help",],);
    expect(filterSlashCandidates(names, "rool",),).toEqual(["roll",],);
  });

  test("unrelated input still yields no candidates", () => {
    expect(filterSlashCandidates(names, "zzz",),).toEqual([],);
    expect(filterSlashCandidates([], "hep",),).toEqual([],);
  });
});

describe("didYouMeanCandidate", () => {
  test("returns the closest name and null for unrelated input", () => {
    expect(didYouMeanCandidate(["help", "roll",], "hep",),).toBe("help",);
    expect(didYouMeanCandidate(["help", "roll",], "zzz",),).toBeNull();
    expect(didYouMeanCandidate([], "hep",),).toBeNull();
    expect(didYouMeanCandidate(["help", "roll",], "",),).toBeNull();
  });

  // editDistance is now shared with the emoji autocomplete surface. The
  // slash-side caller always passed pre-lowercased strings, so the merge is
  // behaviour-preserving only if the shared helper's own lowercasing stays
  // inert for them: these pin that contract at the call site.
  test("lowercases its own inputs, so mixed-case registries still match", () => {
    expect(editDistance("HELP", "hep",),).toBe(1,);
    expect(editDistance("help", "hep",),).toBe(1,);
    expect(editDistance("roll", "roll",),).toBe(0,);
    expect(didYouMeanCandidate(["Help",], "hep",),).toBe("Help",);
  });
});

describe("slashTokenRe", () => {
  test("matches at start of string and after whitespace only", () => {
    expect(slashTokenRe.test("/im",),).toBe(true,);
    expect(slashTokenRe.test("hi /im",),).toBe(true,);
    expect(slashTokenRe.test("hi/im",),).toBe(false,);
  });
});

// ── Alpine state slice ───────────────────────────────────────

describe("slashAutocomplete.handleSlashInput", () => {
  test("opens the popover with a substring filter for /im", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ctx._slashQuery,).toBe("im",);
    expect(ctx._slashCandidates.map((c,) => c.name),).toEqual(["improve", "impersonate", "image",],);
    expect(ctx._slashActiveIndex,).toBe(0,);
  });

  test("a bare slash shows every command in registry order", () => {
    const ta = makeTextarea("/",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ctx._slashQuery,).toBe("",);
    expect(ctx._slashCandidates.map((c,) => c.name),).toEqual(commandFixtures.map((c,) => c.name),);
  });

  test("non-slash text closes the popover", () => {
    const ta = makeTextarea("hello world",);
    const ctx = buildCtx(commandFixtures, ta,);
    ctx._showSlashPopover = true;
    ctx._slashActiveIndex = 2;
    ctx._slashCandidates = [{ name: "image", description: "", descriptionKey: "commands.image", },];
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(false,);
    expect(ctx._slashActiveIndex,).toBe(0,);
    expect(ctx._slashCandidates,).toEqual([],);
    expect(ctx._slashQuery,).toBe("",);
  });

  test("preserves the leading separator when accepting a candidate", () => {
    const ta = makeTextarea("say /he to me", 7,);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._slashCandidates.map((c,) => c.name),).toEqual(["help",],);
    slashAutocomplete.selectSlashCandidate!.call(
      ctx as never,
      { name: "help", description: "d", descriptionKey: "commands.help", },
    );

    expect(ta.value,).toBe("say /help  to me",);
    expect(ta.selectionStart,).toBe("say /help ".length,);
    expect(ctx._showSlashPopover,).toBe(false,);
  });

  test("accepting a candidate replaces the caret token, not an earlier token", () => {
    const ta = makeTextarea("/old /ne",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._slashQuery,).toBe("ne",);
    slashAutocomplete.selectSlashCandidate!.call(
      ctx as never,
      { name: "new", description: "d", descriptionKey: "commands.new", },
    );

    expect(ta.value,).toBe("/old /new ",);
    expect(ta.selectionStart,).toBe("/old /new ".length,);
  });

  test("Tab accepts the active candidate and prevents the default Tab behavior", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    const { event, prevented, } = keyEvent("Tab", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(true,);
    expect(ta.value,).toBe("/improve ",);
    expect(ctx._showSlashPopover,).toBe(false,);
  });

  test("ArrowDown / ArrowUp wrap the candidate selection", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._slashCandidates.length,).toBe(3,);
    const down = keyEvent("ArrowDown", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, down.event,);
    expect(ctx._slashActiveIndex,).toBe(1,);
    const up = keyEvent("ArrowUp", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, up.event,);
    expect(ctx._slashActiveIndex,).toBe(0,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, up.event,);
    expect(ctx._slashActiveIndex,).toBe(2,);
  });

  test("Escape closes the popover and preserves the composer text", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(true,);
    const { event, prevented, } = keyEvent("Escape", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ctx._showSlashPopover,).toBe(false,);
    expect(ta.value,).toBe("/im",);
  });

  test("Escape with no candidates still closes the popover", () => {
    const ta = makeTextarea("/zzz",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ctx._slashCandidates,).toEqual([],);
    const { event, } = keyEvent("Escape", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(ctx._showSlashPopover,).toBe(false,);
  });

  test("handleSlashEnter returns true and accepts when popover is open", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    const handled = slashAutocomplete.handleSlashEnter!.call(ctx as never,);
    expect(handled,).toBe(true,);
    expect(ta.value,).toBe("/improve ",);
    expect(ctx._showSlashPopover,).toBe(false,);
  });

  test("handleSlashEnter returns false when no popover is open", () => {
    const ta = makeTextarea("hello",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    const handled = slashAutocomplete.handleSlashEnter!.call(ctx as never,);
    expect(handled,).toBe(false,);
    expect(ta.value,).toBe("hello",);
  });

  test("handleSlashKeydown ignores non-textarea targets", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    ctx._showSlashPopover = true;
    ctx._slashCandidates = [{ name: "improve", description: "", descriptionKey: "commands.improve", },];
    wire(ctx,);
    const { event, prevented, } = keyEvent("Tab", {
      tagName: "DIV",
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
      focus() {},
    },);

    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ta.value,).toBe("/im",);
  });

  test("handleSlashKeydown skips during IME composition", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    ctx._showSlashPopover = true;
    ctx._slashCandidates = [{ name: "improve", description: "", descriptionKey: "commands.improve", },];
    wire(ctx,);
    let stopped = false;
    const event = {
      key: "Tab",
      shiftKey: false,
      target: ta,
      isComposing: true,
      preventDefault() {
        stopped = true;
      },
    } as unknown as KeyboardEvent;

    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(stopped,).toBe(false,);
    expect(ta.value,).toBe("/im",);
  });

  test("handleSlashKeydown returns early when popover is closed", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    expect(ctx._showSlashPopover,).toBe(false,);
    const { event, prevented, } = keyEvent("Tab", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ta.value,).toBe("/im",);
  });

  test("non-Escape keys on empty popover leave state untouched", () => {
    const ta = makeTextarea("/zzz",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ctx._slashCandidates,).toEqual([],);
    const { event, prevented, } = keyEvent("Tab", ta,);
    slashAutocomplete.handleSlashKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ctx._showSlashPopover,).toBe(true,);
  });

  test("selectSlashCandidate is a no-op when $refs.messageInput is missing", () => {
    const ctx = buildCtx(commandFixtures, makeTextarea("/im",),);
    ctx.$refs = {} as { messageInput: FakeTextarea };
    ctx._showSlashPopover = true;
    wire(ctx,);
    slashAutocomplete.selectSlashCandidate!.call(
      ctx as never,
      { name: "improve", description: "", descriptionKey: "commands.improve", },
    );

    expect(ctx._showSlashPopover,).toBe(true,);
    expect(ctx._slashCandidates,).toEqual([],);
  });

  test("acceptSlashAtIndex returns false for an out-of-range index", () => {
    const ta = makeTextarea("/im",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    slashAutocomplete.handleSlashInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    const result = slashAutocomplete.acceptSlashAtIndex!.call(ctx as never, 99,);
    expect(result,).toBe(false,);
    expect(ta.value,).toBe("/im",);
  });

  test("moveSlashSelection returns early when there are no candidates", () => {
    const ta = makeTextarea("hello",);
    const ctx = buildCtx(commandFixtures, ta,);
    wire(ctx,);
    ctx._slashActiveIndex = 7;
    slashAutocomplete.moveSlashSelection!.call(ctx as never, 1,);
    expect(ctx._slashActiveIndex,).toBe(7,);
  });
});
