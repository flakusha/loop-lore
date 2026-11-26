// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { commandPalette, } from "./chat-actions/command-palette";
import { chatGroup, } from "./chat-group";
import { recallComposerHistory, } from "./composer-history";

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
  activeChat: string | null;
  _composerHistory: Map<string, string[]>;
  _composerHistoryChat: string | null;
  _composerHistoryCursor: number;
  _showSlashPopover: boolean;
  _showEmojiPopover: boolean;
  _emojiPickerOpen: boolean;
  autoResize(el: FakeTextarea,): void;
  saveComposerDraft(): void;
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
    activeChat: "c1",
    _composerHistory: new Map<string, string[]>(),
    _composerHistoryChat: null,
    _composerHistoryCursor: 0,
    _showSlashPopover: false,
    _showEmojiPopover: false,
    _emojiPickerOpen: false,
    autoResize() {},
    saveComposerDraft() {},
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
    handleComposerEnter: chatGroup.handleComposerEnter,
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

describeOrSkip("chatGroup mentions", () => {
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
},);

describeOrSkip("chatGroup.handleComposerKeydown command palette", () => {
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
},);

// ── Group pause state ──
let pauseHandler: ((url: string,) => Response) | null = null;
// Hoisted: chat-group binds the stubbed apiFetch for the pause tests below.
if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string,) => {
      if (pauseHandler) { return pauseHandler(url,); }
      return new Response("{}", { status: 200, },);
    },
  }),);
}

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

describeOrSkip("isChatPaused", () => {
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
},);

describeOrSkip("toggleGroupPause", () => {
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
},);

describeOrSkip("chatGroup.handleComposerEnter", () => {
  test("Enter accepts the open mention instead of sending", () => {
    const ta = makeTextarea("hello @al",);
    const ctx = buildCtx(participants, ta,);
    wire(ctx,);
    let sent = 0;
    Object.assign(ctx, {
      sendMessage: () => {
        sent += 1;
      },
    },);

    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    expect(ctx._showMentionAutocomplete,).toBe(true,);
    chatGroup.handleComposerEnter!.call(ctx as never,);
    expect(ta.value,).toBe("hello @alice ",);
    expect(ctx._showMentionAutocomplete,).toBe(false,);
    expect(sent,).toBe(0,);
  });

  test("Enter accepts the open palette entry instead of sending", () => {
    const ta = makeTextarea("/ro",);
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    let sent = 0;
    Object.assign(ctx, {
      sendMessage: () => {
        sent += 1;
      },
    },);

    ctx._showCommandPalette = true;
    ctx._filteredCommands = [{ name: "roll", descriptionKey: "k1", description: "d1", },];
    chatGroup.handleComposerEnter!.call(ctx as never,);
    expect(ta.value,).toBe("/roll ",);
    expect(ctx._showCommandPalette,).toBe(false,);
    expect(sent,).toBe(0,);
  });

  test("Enter with nothing open sends the message", () => {
    const ta = makeTextarea("hello",);
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    let sent = 0;
    Object.assign(ctx, {
      sendMessage: async () => {
        sent += 1;
      },
    },);

    chatGroup.handleComposerEnter!.call(ctx as never,);
    expect(sent,).toBe(1,);
  });

  test("Enter is a no-op in the keydown router (owned by handleComposerEnter)", () => {
    const ta = makeTextarea("hello @al",);
    const ctx = buildCtx(participants, ta,);
    wire(ctx,);
    chatGroup.handleMentionInput!.call(ctx as never, { target: ta, } as unknown as Event,);
    const { event, prevented, } = keyEvent("Enter", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, event,);
    expect(prevented(),).toBe(false,);
    expect(ctx._showMentionAutocomplete,).toBe(true,);
  });

  test("a rejected send surfaces a failure toast instead of an unhandled rejection", async () => {
    const ta = makeTextarea("hello",);
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    const toasts: unknown[] = [];
    Object.assign(ctx, {
      sendMessage: async (): Promise<void> => {
        throw new Error("offline",);
      },
      $dispatch: (_event: string, detail: unknown,) => {
        toasts.push(detail,);
      },
    },);

    chatGroup.handleComposerEnter!.call(ctx as never,);
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    // i18n.test-helper loads the real en.json catalog; t("toasts.failedSend") resolves to "Failed to send".
    expect(toasts,).toEqual([{ type: "error", message: "Failed to send", },],);
  });
},);

describeOrSkip("chatGroup composer history recall", () => {
  test("ArrowUp walks older lines, ArrowDown returns to newer then the empty draft", () => {
    const ta = makeTextarea("",);
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    ctx._composerHistory = new Map<string, string[]>([
      ["c1", ["first", "second",],],
      ["c2", ["other chat",],],
    ],);

    ctx._composerHistoryCursor = 2;
    let resizes = 0;
    let saves = 0;
    ctx.autoResize = () => {
      resizes += 1;
    };

    ctx.saveComposerDraft = () => {
      saves += 1;
    };

    for (const text of ["second", "first",]) {
      const up = keyEvent("ArrowUp", ta,);
      chatGroup.handleComposerKeydown!.call(ctx as never, up.event,);
      expect(up.prevented(),).toBe(true,);
      expect(ta.value,).toBe(text,);
    }

    // Oldest entry reached: further Up is a no-op.
    chatGroup.handleComposerKeydown!.call(ctx as never, keyEvent("ArrowUp", ta,).event,);
    expect(ta.value,).toBe("first",);

    for (const text of ["second", "",]) {
      chatGroup.handleComposerKeydown!.call(ctx as never, keyEvent("ArrowDown", ta,).event,);
      expect(ta.value,).toBe(text,);
    }

    // Empty draft reached: further Down is a no-op.
    chatGroup.handleComposerKeydown!.call(ctx as never, keyEvent("ArrowDown", ta,).event,);
    expect(ta.value,).toBe("",);
    expect(resizes,).toBe(4,);
    expect(saves,).toBe(4,);

    // Chat switch: cursor follows the new chat, with no cross-chat leak.
    ctx.activeChat = "c2";
    chatGroup.handleComposerKeydown!.call(ctx as never, keyEvent("ArrowUp", ta,).event,);
    expect(ta.value,).toBe("other chat",);
    expect(ctx._composerHistoryChat,).toBe("c2",);
  });

  test("recallComposerHistory steps back one line within the active chat", () => {
    const ta = makeTextarea("",);
    const ctx = buildCtx([], ta,);
    ctx._composerHistory = new Map<string, string[]>([["c1", ["first", "second",],],],);
    ctx._composerHistoryChat = "c1";
    ctx._composerHistoryCursor = 2;

    recallComposerHistory(ctx as never, ta as never, -1,);
    expect(ta.value,).toBe("second",);
    expect(ctx._composerHistoryCursor,).toBe(1,);
  });

  test("open popovers own the arrows, including with zero results", () => {
    const ta = makeTextarea("typing",);
    const ctx = buildCtx([], ta,);
    wire(ctx,);
    ctx._composerHistory = new Map<string, string[]>([["c1", ["sent",],],],);
    ctx._composerHistoryCursor = 1;
    ctx._composerHistoryChat = "c1";

    const popovers = [
      "_showMentionAutocomplete",
      "_showCommandPalette",
      "_showSlashPopover",
      "_showEmojiPopover",
      "_emojiPickerOpen",
    ] as const;

    for (const key of popovers) {
      ctx[key] = true;
      const up = keyEvent("ArrowUp", ta,);
      chatGroup.handleComposerKeydown!.call(ctx as never, up.event,);
      expect(ta.value,).toBe("typing",);
      expect(up.prevented(),).toBe(false,);
      expect(ctx._composerHistoryCursor,).toBe(1,);
      ctx[key] = false;
    }

    ctx._showCommandPalette = true;
    ctx._filteredCommands = [{ name: "roll", descriptionKey: "k1", description: "d1", },];
    const paletteUp = keyEvent("ArrowUp", ta,);
    chatGroup.handleComposerKeydown!.call(ctx as never, paletteUp.event,);
    expect(paletteUp.prevented(),).toBe(true,);
    expect(ta.value,).toBe("typing",);
    expect(ctx._composerHistoryCursor,).toBe(1,);
  });
},);
