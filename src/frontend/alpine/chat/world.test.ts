// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { chatWorld, } from "./world";

// ── Mock apiFetch (chat/world imports ../htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let handler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;

mock.module("../htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!handler) { return new Response("{}", { status: 200, },); }
    return handler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  handler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  handler = null;
},);

// ── Alpine.store stub: provide stateful ui/chat stores via globalThis.Alpine ──
type AlpineStore = {
  hasActiveChat?: boolean;
  showChatList?: boolean;
  showGallery?: boolean;
  showCharacterInfo?: boolean;
  currentChat?: unknown;
};
const uiStore: AlpineStore = {
  hasActiveChat: false,
  showChatList: false,
  showGallery: false,
  showCharacterInfo: false,
};
const chatStore: AlpineStore = { currentChat: null, };
const stores: Record<string, AlpineStore> = { ui: uiStore, chat: chatStore, };
const alpineMock = {
  store: (name: string,) => stores[name] ?? {},
  initTree: () => {},
};
const originalAlpine = (globalThis as Record<string, unknown>).Alpine;
beforeEach(() => {
  uiStore.hasActiveChat = false;
  uiStore.showChatList = false;
  uiStore.showGallery = false;
  uiStore.showCharacterInfo = false;
  chatStore.currentChat = null;
  (globalThis as Record<string, unknown>).Alpine = alpineMock;
},);
afterEach(() => {
  (globalThis as Record<string, unknown>).Alpine = originalAlpine;
},);

// ── history stub (bare `history` in source resolves via globalThis.history) ──
const replaceCalls: { state: unknown; title: string; url: string }[] = [];
// historyGlobal typed as Record<string, any> to bypass lib.dom History interface requirements
const historyGlobal: Record<string, any> = globalThis as Record<string, any>;
const originalReplace = historyGlobal.history?.replaceState;
beforeEach(() => {
  replaceCalls.length = 0;
  historyGlobal.history = {
    replaceState: (state: unknown, title: string, url: string,) => {
      replaceCalls.push({ state, title, url, },);
    },
  };
},);
afterEach(() => {
  if (originalReplace) {
    historyGlobal.history = { replaceState: originalReplace, };
  } else {
    delete historyGlobal.history;
  }
},);

function worldCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    _worlds: [],
    _worldsLoading: false,
    _worldChats: {},
    _worldExpanded: {},
    activeChat: null,
    loadWorldChats: chatWorld.loadWorldChats,
    flushComposerDraft: () => {},
    restoreComposerDraft: () => {},
    ...overrides,
  };
}

const noop = () => Promise.resolve();

function makeSelectCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return worldCtx({
    chats: [{ id: "c1", name: "Council", },],
    loadingError: "stale-error",
    currentPage: 5,
    hasMoreMessages: false,
    loadingOlder: true,
    _sections: [{ id: "s1", },],
    _activeSectionId: "s1",
    _background: { url: "old.png", },
    _locations: [{ id: "loc1", },],
    _selectedLocationId: "loc1",
    _chatWorldId: "old-world",
    _chatCurrentLocationId: "old-loc",
    _chatRecentLocationChanged: true,
    _locationJoinableChats: [{ id: "ljc1", },],
    isGroupChat: false,
    loadMessages: noop,
    loadSections: noop,
    loadBackground: noop,
    loadGalleryAssets: noop,
    loadCharacterInfo: noop,
    loadMood: noop,
    markChatAsRead: noop,
    loadChatKey: noop,
    loadImpersonationState: noop,
    loadQuickReplies: () => {},
    fireStartupQuickReplies: noop,
    startProactiveScheduler: () => {},
    loadParticipants: noop,
    loadTurnOrder: noop,
    loadAvailableActors: noop,
    ...overrides,
  },);
}

describe("chatWorld.loadWorldChannels", () => {
  test("returns early while already loading", async () => {
    const ctx = worldCtx({ _worldsLoading: true, },);
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("keeps only chat-kind worlds and loads their channels", async () => {
    const loaded: string[] = [];
    handler = async (url,) => {
      if (url === "/api/v1/worlds?pageSize=50") {
        return Response.json({
          data: [
            { id: "w1", name: "Chat World", kind: "chat", },
            { id: "w2", name: "RPG World", kind: "rpg", },
            { id: "w3", name: "No Kind", },
          ],
        },);
      }
      loaded.push(url,);
      return Response.json({ data: [], },);
    };
    const ctx = worldCtx();
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(ctx._worlds,).toEqual([{ id: "w1", name: "Chat World", },],);
    expect(loaded,).toEqual(["/api/v1/worlds/w1/chats",],);
    expect(ctx._worldsLoading,).toBe(false,);
  });

  test("ignores non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = worldCtx();
    await chatWorld.loadWorldChannels!.call(ctx,);
    expect(ctx._worlds,).toEqual([],);
    expect(ctx._worldsLoading,).toBe(false,);
  });

  test("keeps the tree working when the network fails", async () => {
    handler = () => {
      throw new Error("offline",);
    };
    const ctx = worldCtx();
    await expect(chatWorld.loadWorldChannels!.call(ctx,),).resolves.toBeUndefined();
    expect(ctx._worldsLoading,).toBe(false,);
  });
});

describe("chatWorld.loadWorldChats", () => {
  test("stores rows per world", async () => {
    mockFetch(200, { data: [{ id: "c1", },], },);
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toHaveLength(1,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/worlds/w1/chats",);
  });

  test("keeps previous rows on non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = worldCtx({ _worldChats: { w1: [{ id: "keep", },], }, },);
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([{ id: "keep", },],);
  });

  test("defaults to an empty list on malformed payloads", async () => {
    mockFetch(200, {},);
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([],);
  });

  test("clears the world on network error", async () => {
    handler = () => {
      throw new Error("offline",);
    };
    const ctx = worldCtx();
    await chatWorld.loadWorldChats!.call(ctx, "w1",);
    expect((ctx._worldChats as Record<string, unknown[]>)["w1"],).toEqual([],);
  });
});

describe("chatWorld.toggleWorld", () => {
  test("expands and loads uncached worlds", () => {
    let loaded: string[] = [];
    const ctx = worldCtx({
      _worldExpanded: {},
      _worldChats: {},
      loadWorldChats: (id: string,) => {
        loaded.push(id,);
      },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect((ctx._worldExpanded as Record<string, boolean>)["w1"],).toBe(true,);
    expect(loaded,).toEqual(["w1",],);
  });

  test("collapsing does not reload", () => {
    let loads = 0;
    const ctx = worldCtx({
      _worldExpanded: { w1: true, },
      _worldChats: {},
      loadWorldChats: () => {
        loads++;
      },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect((ctx._worldExpanded as Record<string, boolean>)["w1"],).toBe(false,);
    expect(loads,).toBe(0,);
  });

  test("expanding a cached world does not reload", () => {
    let loads = 0;
    const ctx = worldCtx({
      _worldExpanded: {},
      _worldChats: { w1: [], },
      loadWorldChats: () => {
        loads++;
      },
    },);
    chatWorld.toggleWorld!.call(ctx, "w1",);
    expect(loads,).toBe(0,);
  });
});

describe("chatWorld.getChatId", () => {
  test("returns the active chat", () => {
    expect(chatWorld.getChatId!.call({ activeChat: "c1", },),).toBe("c1",);
    expect(chatWorld.getChatId!.call({ activeChat: null, },),).toBeNull();
  });
});

describe("chatWorld.selectChat guards", () => {
  test("ignores reentrant calls while a selection is in flight", async () => {
    let inner = 0;
    const ctx = worldCtx({
      _selectingChat: true,
      _selectChatInner: async () => {
        inner++;
      },
    },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(inner,).toBe(0,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("warns when a generation is running instead of switching", async () => {
    const toasts: { type: string; message: string }[] = [];
    let inner = 0;
    const ctx = worldCtx({
      isGenerating: true,
      _selectChatInner: async () => {
        inner++;
      },
      $dispatch: (e: string, d: { type: string; message: string },) => {
        if (e === "show-toast") { toasts.push(d,); }
      },
    },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(inner,).toBe(0,);
    expect(toasts[0]?.type,).toBe("warning",);
  });

  test("clears the guard after a successful selection", async () => {
    const ctx = worldCtx({ _selectingChat: false, _selectChatInner: async () => {}, },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(ctx._selectingChat,).toBe(false,);
  });

  test("flushes the outgoing draft before entering the new chat", async () => {
    const events: string[] = [];
    const ctx = worldCtx({
      activeChat: "old",
      _selectingChat: false,
      _selectChatInner: async () => {
        events.push("inner",);
      },
      flushComposerDraft: () => {
        events.push("flush",);
      },
    },);
    await chatWorld.selectChat!.call(ctx, "c1",);
    expect(events,).toEqual(["flush", "inner",],);
  });
});

// ── Coverage for _selectChatInner ──────────────────────────────────

describe("chatWorld._selectChatInner happy path", () => {
  test("populates state, dismisses panels, restores draft, and reloads", async () => {
    const events: string[] = [];
    const titleEl = { textContent: "", };
    const originalQS = document.querySelector;
    document.querySelector = ((sel: string,) => {
      if (sel === "#page-title") { return titleEl; }
      return null;
    }) as typeof document.querySelector;

    const ctx = makeSelectCtx({
      flushComposerDraft: () => {
        events.push("flush",);
      },
      restoreComposerDraft: () => {
        events.push("restore",);
      },
      loadMessages: () => {
        events.push("messages",);
        return Promise.resolve();
      },
      loadQuickReplies: () => {
        events.push("quickReplies",);
      },
      startProactiveScheduler: () => {
        events.push("scheduler",);
      },
    },);

    try {
      await chatWorld._selectChatInner!.call(ctx, "c1",);
    } finally {
      document.querySelector = originalQS;
    }

    // State mutations
    expect(ctx.loadingError,).toBeNull();
    expect(ctx.activeChat,).toBe("c1",);
    expect(ctx.activeChatName,).toBe("Council",);
    expect(ctx.currentPage,).toBe(1,);
    expect(ctx.hasMoreMessages,).toBe(true,);
    expect(ctx.loadingOlder,).toBe(false,);
    // Location-scoped state was reset
    expect(ctx._sections,).toEqual([],);
    expect(ctx._activeSectionId,).toBeNull();
    expect(ctx._background,).toBeNull();
    expect(ctx._locations,).toEqual([],);
    expect(ctx._selectedLocationId,).toBe("",);
    expect(ctx._chatWorldId,).toBeNull();
    expect(ctx._chatCurrentLocationId,).toBeNull();
    expect(ctx._chatRecentLocationChanged,).toBe(false,);
    expect(ctx._locationJoinableChats,).toEqual([],);
    // UI store flipped
    expect(uiStore.hasActiveChat,).toBe(true,);
    expect(uiStore.showChatList,).toBe(false,);
    expect(uiStore.showGallery,).toBe(false,);
    expect(uiStore.showCharacterInfo,).toBe(false,);
    // Chat store currentChat
    expect(chatStore.currentChat,).toEqual({ id: "c1", name: "Council", },);
    // Page title updated
    expect(titleEl.textContent,).toBe("Council",);
    // History replaced
    expect(replaceCalls,).toHaveLength(1,);
    expect(replaceCalls[0]!.url,).toBe("/views/chat?chatid=c1",);
    // Reload order: selectReload first, then postLoad, then quickReplies + startup
    const messagesIdx = events.indexOf("messages",);
    const restoreIdx = events.indexOf("restore",);
    const quickIdx = events.indexOf("quickReplies",);
    const schedIdx = events.indexOf("scheduler",);
    expect(restoreIdx,).toBeGreaterThanOrEqual(0,);
    expect(messagesIdx,).toBeGreaterThan(restoreIdx,);
    expect(quickIdx,).toBeGreaterThan(messagesIdx,);
    expect(schedIdx,).toBeGreaterThan(quickIdx,);
  });

  test("falls back to the localized untitled key when no chat matches", async () => {
    const ctx = makeSelectCtx({ chats: [], },);
    await chatWorld._selectChatInner!.call(ctx, "missing",);
    // When no chat row matches, activeChatName is the t('chats.untitledChat')
    // result. Don't pin the exact string — it may resolve to either the raw
    // key (when __localeStrings is empty) or a localized translation (when
    // i18n.test-helper runs first). Just verify it is NOT the matched chat's
    // name.
    expect(ctx.activeChatName,).not.toBe("Council",);
  });

  test("swallows the chat-store error when Alpine.store('chat',) throws", async () => {
    const failingAlpine = {
      store: (name: string,) => {
        if (name === "chat") { throw new Error("store not ready",); }
        return stores[name] ?? {};
      },
      initTree: () => {},
    };
    const original = (globalThis as Record<string, unknown>).Alpine;
    (globalThis as Record<string, unknown>).Alpine = failingAlpine;
    try {
      const ctx = makeSelectCtx({ chats: [{ id: "c1", name: "X", },], },);
      await expect(chatWorld._selectChatInner!.call(ctx, "c1",),).resolves.toBeUndefined();
      expect(ctx.activeChatName,).toBe("X",);
    } finally {
      (globalThis as Record<string, unknown>).Alpine = original;
    }
  });

  test("skips the title update when #page-title is missing", async () => {
    const originalQS = document.querySelector;
    document.querySelector = ((_sel: string,) => null) as typeof document.querySelector;
    try {
      const ctx = makeSelectCtx({ chats: [{ id: "c1", name: "X", },], },);
      await chatWorld._selectChatInner!.call(ctx, "c1",);
      expect(ctx.activeChat,).toBe("c1",);
    } finally {
      document.querySelector = originalQS;
    }
  });

  test("throws when any selectReload Promise.allSettled rejects", async () => {
    const ctx = makeSelectCtx({
      loadSections: () => Promise.reject(new Error("sections down",),),
    },);
    await expect(chatWorld._selectChatInner!.call(ctx, "c1",),).rejects.toThrow("select chat reload failed",);
  });

  test("throws when any postLoad Promise.allSettled rejects", async () => {
    const ctx = makeSelectCtx({
      markChatAsRead: () => Promise.reject(new Error("mark read failed",),),
    },);
    await expect(chatWorld._selectChatInner!.call(ctx, "c1",),).rejects.toThrow("select chat post-load failed",);
  });

  test("loads group-chat participants, turn order, and actors when isGroupChat", async () => {
    const calls: string[] = [];
    const ctx = makeSelectCtx({
      isGroupChat: true,
      loadParticipants: () => {
        calls.push("participants",);
        return Promise.resolve();
      },
      loadTurnOrder: () => {
        calls.push("turnOrder",);
        return Promise.resolve();
      },
      loadAvailableActors: () => {
        calls.push("availableActors",);
        return Promise.resolve();
      },
    },);
    await chatWorld._selectChatInner!.call(ctx, "c1",);
    expect(calls,).toContain("participants",);
    expect(calls,).toContain("turnOrder",);
    expect(calls,).toContain("availableActors",);
  });

  test("throws when any group-load Promise.allSettled rejects", async () => {
    const ctx = makeSelectCtx({
      isGroupChat: true,
      loadTurnOrder: () => Promise.reject(new Error("turn order broken",),),
    },);
    await expect(chatWorld._selectChatInner!.call(ctx, "c1",),).rejects.toThrow("group chat load failed",);
  });

  test("skips group loads when not a group chat", async () => {
    let groupCalls = 0;
    const ctx = makeSelectCtx({
      isGroupChat: false,
      loadParticipants: () => {
        groupCalls++;
        return Promise.resolve();
      },
      loadTurnOrder: () => {
        groupCalls++;
        return Promise.resolve();
      },
      loadAvailableActors: () => {
        groupCalls++;
        return Promise.resolve();
      },
    },);
    await chatWorld._selectChatInner!.call(ctx, "c1",);
    expect(groupCalls,).toBe(0,);
  });
});

describe("chatWorld.selectChat successful flow", () => {
  test("enters _selectChatInner, clears the guard, and propagates errors", async () => {
    let inner = 0;
    const ctx = worldCtx({
      _selectingChat: false,
      _selectChatInner: async () => {
        inner++;
        throw new Error("inner boom",);
      },
    },);
    await expect(chatWorld.selectChat!.call(ctx, "c1",),).rejects.toThrow("inner boom",);
    expect(inner,).toBe(1,);
    expect(ctx._selectingChat,).toBe(false,);
  });
});
