// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, mock, test, } from "bun:test";
import { commandPalette, } from "./chat-actions/command-palette";
import { chatGroup, } from "./chat-group";

interface FakeTextarea {
  tagName: string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus(): void;
}

interface MentionCtx {
  _mentionQuery: string;
  _mentionResults: { actor_id: string; name: string; display_name?: string }[];
  _showMentionAutocomplete: boolean;
  _mentionActiveIndex: number;
  _chatParticipants: { actor_id: string; name: string; display_name?: string }[];
  _showCommandPalette: boolean;
  _filteredCommands: { name: string; descriptionKey: string; description: string }[];
  _paletteActiveIndex: number;
  $refs: { messageInput: FakeTextarea };
}

const participants = [
  { actor_id: "a1", name: "alice", display_name: "Alice", },
  { actor_id: "a2", name: "jose", display_name: "José García", },
  { actor_id: "a3", name: "tanaka", display_name: "田中太郎", },
  { actor_id: "a4", name: "anne-marie", display_name: "Anne-Marie", },
];

function makeTextarea(value: string, cursor?: number,): FakeTextarea {
  const pos = cursor ?? value.length;
  return { tagName: "TEXTAREA", value, selectionStart: pos, selectionEnd: pos, focus() {}, };
}

function buildCtx(list: typeof participants, ta: FakeTextarea,): MentionCtx {
  return {
    _mentionQuery: "",
    _mentionResults: [],
    _showMentionAutocomplete: false,
    _mentionActiveIndex: 0,
    _chatParticipants: list.map((p,) => ({ ...p, })),
    _showCommandPalette: false,
    _filteredCommands: [],
    _paletteActiveIndex: 0,
    $refs: { messageInput: ta, },
  };
}

function wire(ctx: MentionCtx,): void {
  Object.assign(ctx, {
    selectMention: chatGroup.selectMention,
    hideMentionAutocomplete: chatGroup.hideMentionAutocomplete,
    acceptMentionAtIndex: chatGroup.acceptMentionAtIndex,
    moveMentionSelection: chatGroup.moveMentionSelection,
    handleComposerKeydown: chatGroup.handleComposerKeydown,
    selectCommand: commandPalette.selectCommand,
    acceptPaletteAtIndex: commandPalette.acceptPaletteAtIndex,
    movePaletteSelection: commandPalette.movePaletteSelection,
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

describe("chatGroup mentions", () => {
  test("matches multi-byte display names", () => {
    const ta = makeTextarea("hi @田",);
    const ctx = buildCtx(participants, ta,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showMentionAutocomplete,).toBe(true,);
    expect(ctx._mentionResults.map((p,) => p.actor_id),).toEqual(["a3",],);
  });

  test("matches accented and hyphenated names", () => {
    const ta = makeTextarea("hi @josé",);
    const ctx = buildCtx(participants, ta,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._mentionResults.map((p,) => p.actor_id),).toEqual(["a2",],);
    const ta2 = makeTextarea("hi @anne-",);
    const ctx2 = buildCtx(participants, ta2,);
    chatGroup.handleMentionInput!.call(ctx2 as never, { target: ta2, } as unknown as Event,);
    expect(ctx2._mentionResults.map((p,) => p.actor_id),).toEqual(["a4",],);
  });

  test("Tab accepts the active mention, replacing the token at the cursor", () => {
    const ta = makeTextarea("hello @al, how are you", 9,);
    const ctx = buildCtx(participants, ta,);
    wire(ctx,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._mentionResults.map((p,) => p.actor_id),).toEqual(["a1",],);
    const { event, prevented, } = keyEvent("Tab", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(true,);
    expect(ta.value,).toBe("hello @alice , how are you",);
    expect(ta.selectionStart,).toBe("hello @alice ".length,);
    expect(ctx._showMentionAutocomplete,).toBe(false,);
  });

  test("ArrowDown wraps the mention selection", () => {
    const ta = makeTextarea("hi @",);
    const ctx = buildCtx(participants, ta,);
    wire(ctx,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    const down = keyEvent("ArrowDown", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, down.event,);
    expect(ctx._mentionActiveIndex,).toBe(1,);
    const up = keyEvent("ArrowUp", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, up.event,);
    chatGroup.handleComposerKeydown!.call(ctx as never, up.event,);
    expect(ctx._mentionActiveIndex,).toBe(3,);
  });

  test("Escape hides the autocomplete and preserves input", () => {
    const ta = makeTextarea("hello @al",);
    const ctx = buildCtx(participants, ta,);
    wire(ctx,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showMentionAutocomplete,).toBe(true,);
    const { event, } = keyEvent("Escape", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(ctx._showMentionAutocomplete,).toBe(false,);
    expect(ta.value,).toBe("hello @al",);
    ta.value = "hello @zzz";
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._mentionResults,).toEqual([],);
    const empty = keyEvent("Escape", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, empty.event,);
    expect(ctx._showMentionAutocomplete,).toBe(false,);
    expect(ta.value,).toBe("hello @zzz",);
  });
});

describe("chatGroup.handleComposerKeydown command palette", () => {
  const entries = [
    { name: "roll", descriptionKey: "k1", description: "d1", },
    { name: "roster", descriptionKey: "k2", description: "d2", },
  ];

  function paletteCtx(ta: FakeTextarea,): MentionCtx {
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    ctx._showCommandPalette = true;
    ctx._filteredCommands = entries.map((e,) => ({ ...e, }));
    return ctx;
  }

  test("plain Tab accepts the active palette entry", () => {
    const ta = makeTextarea("/ro",);
    const ctx = paletteCtx(ta,);
    ctx._paletteActiveIndex = 1;
    const { event, prevented, } = keyEvent("Tab", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(true,);
    expect(ta.value,).toBe("/roster ",);
    expect(ctx._showCommandPalette,).toBe(false,);
  });

  test("Shift+Tab wraps the palette index", () => {
    const ta = makeTextarea("/ro",);
    const ctx = paletteCtx(ta,);
    const { event, prevented, } = keyEvent("Tab", ta, true,);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(true,);
    expect(ctx._paletteActiveIndex,).toBe(1,);
    expect(ta.value,).toBe("/ro",);
    ctx._filteredCommands = [];
    const esc = keyEvent("Escape", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, esc.event,);
    expect(ctx._showCommandPalette,).toBe(false,);
  });

  test("ignores non-textarea targets and IME composition", () => {
    const ta = makeTextarea("/ro",);
    const ctx = paletteCtx(ta,);
    const outside = keyEvent("Tab", { tagName: "DIV", } as unknown as FakeTextarea,);
    chatGroup.handleComposerKeydown!.call(ctx as never, outside.event,);
    expect(outside.prevented(),).toBe(false,);
    const { event, prevented, } = keyEvent("Enter", ta,);
    Object.assign(event, { isComposing: true, },);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ta.value,).toBe("/ro",);
    expect(ctx._showCommandPalette,).toBe(true,);
  });
});

// ── Group pause state ──
let pauseHandler: ((url: string,) => Response) | null = null;
// Hoisted: chat-group binds the stubbed apiFetch for the pause tests below.
mock.module("./htmx", () => ({
  apiFetch: async (url: string,) => {
    if (pauseHandler) { return pauseHandler(url,); }
    return new Response("{}", { status: 200, },);
  },
}),);

interface PauseCtx {
  currentChat: { type?: string; story_state?: string } | null;
  activeChat: string | null;
  _groupPaused: boolean;
  isChatPaused(chat: unknown,): boolean;
  $dispatch?(event: string, detail: unknown,): void;
}

function pauseCtx(chat: PauseCtx["currentChat"],): PauseCtx & { toasts: unknown[] } {
  const toasts: unknown[] = [];
  return {
    currentChat: chat,
    activeChat: "c1",
    _groupPaused: false,
    isChatPaused: chatGroup.isChatPaused!,
    $dispatch(_event: string, detail: unknown,) {
      toasts.push(detail,);
    },
    toasts,
  };
}

describe("isChatPaused", () => {
  test("false without story_state or flag", () => {
    const ctx = pauseCtx({ type: "group", },);
    expect(chatGroup.isChatPaused!.call(ctx as never, ctx.currentChat,),).toBe(false,);
    expect(chatGroup.isChatPaused!.call(ctx as never, null,),).toBe(false,);
    expect(chatGroup.isChatPaused!.call(ctx as never, { story_state: "{}", },),).toBe(false,);
  });
  test("true only when isPaused is exactly true", () => {
    const ctx = pauseCtx(null,);
    expect(chatGroup.isChatPaused!.call(ctx as never, { story_state: '{"isPaused":true}', },),).toBe(true,);
    expect(chatGroup.isChatPaused!.call(ctx as never, { story_state: '{"isPaused":1}', },),).toBe(false,);
    expect(chatGroup.isChatPaused!.call(ctx as never, { story_state: "not-json", },),).toBe(false,);
  });
});

describe("toggleGroupPause", () => {
  test("ignores non-group or missing chat", async () => {
    pauseHandler = () => new Response("{}", { status: 200, },);
    const solo = pauseCtx({ type: "solo", story_state: "{}", },);
    await chatGroup.toggleGroupPause!.call(solo as never,);
    expect(solo._groupPaused,).toBe(false,);
    const missing = pauseCtx(null,);
    await chatGroup.toggleGroupPause!.call(missing as never,);
    expect(missing.toasts,).toEqual([],);
  });
  test("pauses and resumes, persisting isPaused into story_state", async () => {
    pauseHandler = () => new Response("{}", { status: 200, },);
    const chat = { type: "group", story_state: "{}", };
    const ctx = pauseCtx(chat,);
    await chatGroup.toggleGroupPause!.call(ctx as never,);
    expect(ctx._groupPaused,).toBe(true,);
    expect(JSON.parse(chat.story_state,).isPaused,).toBe(true,);
    expect(ctx.toasts.length,).toBe(1,);
    await chatGroup.toggleGroupPause!.call(ctx as never,);
    expect(ctx._groupPaused,).toBe(false,);
    expect(JSON.parse(chat.story_state,).isPaused,).toBe(false,);
  });
  test("surfaces server and network failures as error toasts", async () => {
    pauseHandler = () => new Response(JSON.stringify({ error: "denied", },), { status: 403, },);
    const denied = pauseCtx({ type: "group", story_state: "{}", },);
    await chatGroup.toggleGroupPause!.call(denied as never,);
    expect(denied._groupPaused,).toBe(false,);
    expect(denied.toasts.length,).toBe(1,);
    pauseHandler = () => {
      throw new Error("down",);
    };
    const offline = pauseCtx({ type: "group", story_state: "{}", },);
    await chatGroup.toggleGroupPause!.call(offline as never,);
    expect(offline.toasts.length,).toBe(1,);
    pauseHandler = null;
  });
});
