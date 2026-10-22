// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { DEFAULT_QUICK_EMOJIS, } from "../chat-utils/emoji";
import { chatLifecycle, } from "./lifecycle";

// ── Mock apiFetch ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

// (mockFetch removed)
// ── Alpine store stub ──
const uiStore: Record<string, unknown> = {};
const chatStore: Record<string, unknown> = {};
const stores: Record<string, Record<string, unknown>> = { ui: uiStore, chat: chatStore, };
const alpineMock = {
  store: (name: string,) => (stores[name] ??= {}),
  initTree: () => {},
};

const originalAlpine = (globalThis as Record<string, unknown>).Alpine;

// ── localStorage stub ──
const storageData: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string,) => (k in storageData ? storageData[k] : null),
  setItem: (k: string, v: string,) => {
    storageData[k] = String(v,);
  },
  removeItem: (k: string,) => {
    delete storageData[k];
  },
  clear: () => {
    for (const k of Object.keys(storageData,)) { delete storageData[k]; }
  },
};

// ── location stub ──
const locationMock: { search: string; assign: any } = {
  search: "",
  assign: mock(() => {},),
};

// ── event listener tracking ──
const addedListeners: { type: string; handler: unknown }[] = [];
const removedListeners: { type: string; handler: unknown }[] = [];

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  for (const k of Object.keys(storageData,)) { delete storageData[k]; }
  locationMock.search = "";
  locationMock.assign = mock(() => {},);
  addedListeners.length = 0;
  removedListeners.length = 0;

  // reset stores
  for (const k of Object.keys(uiStore,)) { delete uiStore[k]; }
  for (const k of Object.keys(chatStore,)) { delete chatStore[k]; }
  uiStore.showGallery = false;
  uiStore.showChatList = false;
  uiStore.showCharacterInfo = false;
  uiStore.showMemoryPanel = false;
  uiStore.showChatSettings = false;
  uiStore.hasActiveChat = false;
  uiStore.userRole = "solo";
  chatStore.children = undefined;
  chatStore.visibility = "";

  (globalThis as Record<string, unknown>).Alpine = alpineMock;
  (globalThis as Record<string, unknown>).localStorage = localStorageMock;
  (globalThis as Record<string, unknown>).location = locationMock;

  const g = globalThis as Record<string, unknown>;
  g.addEventListener = (type: string, h: unknown,) => {
    addedListeners.push({ type, handler: h, },);
  };

  g.removeEventListener = (type: string, h: unknown,) => {
    removedListeners.push({ type, handler: h, },);
  };
},);

afterEach(() => {
  (globalThis as Record<string, unknown>).Alpine = originalAlpine;
  (globalThis as Record<string, unknown>).localStorage = undefined;
},);

function makeCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    isGenerating: true,
    isContinuing: true,
    activeAttemptId: "att",
    continuingMessageId: "msg",
    _isScrolledUp: true,
    _contextMenu: { visible: true, },
    _flagDialog: { open: true, },
    _flagReason: "r",
    _flagOther: "o",
    _flagBusy: true,
    _reactionPicker: { visible: true, },
    _reactionActiveIndex: 3,
    _quickEmojis: [],
    detailLevel: "Immersion",
    _storageHandler: null as unknown,
    scrollObserver: { disconnect: mock(() => {},), },
    _scrollHandler: mock(() => {},),
    _scrollEl: { removeEventListener: mock(() => {},), },
    _cleanupSSE: mock(() => {},),
    stopProactiveScheduler: mock(() => {},),
    stopSeenPolling: mock(() => {},),
    restoreChatFilters: mock(() => {},),
    initSeenPopover: mock(() => {},),
    _loadCommandList: mock(async () => {},),
    _startFireAndForgetLoaders: mock(() => {},),
    _loadChatFromUrl: mock(async () => {},),
    loadChats: mock(async () => {},),
    loadWorldChannels: mock(async () => {},),
    loadJoinableChats: mock(async () => {},),
    loadUserInfo: mock(async () => {},),
    registerPanelHandlers: mock(() => {},),
    unregisterPanelHandlers: mock(() => {},),
    selectChat: mock(async () => {},),
    openChatSettings: mock(async () => {},),
    _filterParams: mock(() => "pageSize=200"),
    chats: [{ id: "c1", name: "Chat", }, { id: "c2", name: "Other", },],
    userDisplayName: "",
    userRole: "solo",
    $dispatch: mock(() => {},),
    ...overrides,
  };
}

describeOrSkip("chatLifecycle.init", () => {
  test("resets generation state and quick emojis", async () => {
    storageData["chat-detail-level"] = "Basic";
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    expect(ctx.isGenerating,).toBe(false,);
    expect(ctx.isContinuing,).toBe(false,);
    expect(ctx.activeAttemptId,).toBeNull();
    expect(ctx.continuingMessageId,).toBeNull();
    expect(ctx._isScrolledUp,).toBe(false,);
    expect(ctx._quickEmojis,).toEqual([...DEFAULT_QUICK_EMOJIS,],);
    expect(ctx.detailLevel,).toBe("Basic",);
  });

  test("repairs Alpine chat store defaults", async () => {
    chatStore.children = "nope";
    chatStore.visibility = "";
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    expect(Array.isArray(chatStore.children,),).toBe(true,);
    expect(chatStore.visibility,).toBe("visible",);
  });

  test("resets ui store panels", async () => {
    uiStore.showGallery = true;
    uiStore.showChatList = true;
    uiStore.showCharacterInfo = true;
    uiStore.showMemoryPanel = true;
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    expect(uiStore.showGallery,).toBe(false,);
    expect(uiStore.showChatList,).toBe(false,);
    expect(uiStore.showCharacterInfo,).toBe(false,);
    expect(uiStore.showMemoryPanel,).toBe(false,);
  });

  test("calls initSeenPopover, restoreChatFilters, command list, loadChats", async () => {
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    expect(ctx.initSeenPopover,).toHaveBeenCalled();
    expect(ctx.restoreChatFilters,).toHaveBeenCalled();
    expect(ctx._loadCommandList,).toHaveBeenCalled();
    expect(ctx.loadChats,).toHaveBeenCalled();
    expect(ctx.registerPanelHandlers,).toHaveBeenCalled();
  });

  test("registers storage listener", async () => {
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    expect(addedListeners.some((l,) => l.type === "storage"),).toBe(true,);
  });

  test("storage handler updates detailLevel", async () => {
    const ctx = makeCtx();
    await chatLifecycle.init!.call(ctx,);
    const handler = ctx._storageHandler as (e: StorageEvent,) => void;
    const ev = { key: "chat-detail-level", newValue: "Detailed", } as StorageEvent;
    handler(ev,);
    expect(ctx.detailLevel,).toBe("Detailed",);
  });

  test("registers panel handlers even if load throws", async () => {
    const ctx = makeCtx({
      _loadCommandList: mock(async () => {
        throw new Error("boom",);
      },),
    },);

    try {
      await chatLifecycle.init!.call(ctx,);
    } catch { /* expected */ }

    expect(ctx.registerPanelHandlers,).toHaveBeenCalled();
  });
},);

describeOrSkip("chatLifecycle._startFireAndForgetLoaders", () => {
  test("kicks off all three loaders", () => {
    const ctx = makeCtx();
    chatLifecycle._startFireAndForgetLoaders!.call(ctx,);
    expect(ctx.loadWorldChannels,).toHaveBeenCalled();
    expect(ctx.loadJoinableChats,).toHaveBeenCalled();
    expect(ctx.loadUserInfo,).toHaveBeenCalled();
  });
},);

describeOrSkip("chatLifecycle._loadChatFromUrl", () => {
  test("returns early without chatid", async () => {
    locationMock.search = "";
    const ctx = makeCtx();
    await chatLifecycle._loadChatFromUrl!.call(ctx,);
    expect(ctx.selectChat,).not.toHaveBeenCalled();
  });

  test("redirects when chat does not exist", async () => {
    locationMock.search = "?chatid=missing";
    const ctx = makeCtx({ chats: [{ id: "c1", },], },);
    await chatLifecycle._loadChatFromUrl!.call(ctx,);
    expect(locationMock.assign,).toHaveBeenCalledWith("/views/chat",);
    expect(ctx.selectChat,).not.toHaveBeenCalled();
  });

  test("selects chat when it exists", async () => {
    locationMock.search = "?chatid=c1";
    const ctx = makeCtx();
    await chatLifecycle._loadChatFromUrl!.call(ctx,);
    expect(ctx.selectChat,).toHaveBeenCalledWith("c1",);
  });

  test("opens settings when openSettings param present", async () => {
    locationMock.search = "?chatid=c1&openSettings=1";
    const ctx = makeCtx();
    await chatLifecycle._loadChatFromUrl!.call(ctx,);
    expect(ctx.selectChat,).toHaveBeenCalledWith("c1",);
    expect(ctx.openChatSettings,).toHaveBeenCalled();
  });
},);

describeOrSkip("chatLifecycle.destroy", () => {
  test("unregisters handlers and disconnects observer", () => {
    const ctx = makeCtx();
    const disconnect = (ctx.scrollObserver as { disconnect: any }).disconnect;
    chatLifecycle.destroy!.call(ctx,);
    expect(ctx.unregisterPanelHandlers,).toHaveBeenCalled();
    expect(ctx._cleanupSSE,).toHaveBeenCalled();
    expect(ctx.stopProactiveScheduler,).toHaveBeenCalled();
    expect(ctx.stopSeenPolling,).toHaveBeenCalled();
    expect(disconnect,).toHaveBeenCalled();
    expect(ctx.scrollObserver,).toBeNull();
    expect(ctx._scrollEl,).toBeNull();
    expect(ctx._scrollHandler,).toBeNull();
  });

  test("removes storage listener when present", () => {
    const handler = mock(() => {},);
    const ctx = makeCtx({ _storageHandler: handler, },);
    chatLifecycle.destroy!.call(ctx,);
    expect(removedListeners.some((l,) => l.handler === handler),).toBe(true,);
  });

  test("resets ui store flags", () => {
    uiStore.showChatList = true;
    uiStore.showGallery = true;
    uiStore.showCharacterInfo = true;
    uiStore.showChatSettings = true;
    uiStore.hasActiveChat = true;
    const ctx = makeCtx();
    chatLifecycle.destroy!.call(ctx,);
    expect(uiStore.showChatList,).toBe(false,);
    expect(uiStore.showGallery,).toBe(false,);
    expect(uiStore.showCharacterInfo,).toBe(false,);
    expect(uiStore.showChatSettings,).toBe(false,);
    expect(uiStore.hasActiveChat,).toBe(false,);
  });
},);

describeOrSkip("chatLifecycle.loadUserInfo", () => {
  test("sets display name and role on success", async () => {
    fetchHandler = () => Response.json({ display_name: "Alice", username: "alice", role: "gm", },);
    const ctx = makeCtx();
    await chatLifecycle.loadUserInfo!.call(ctx,);
    expect(ctx.userDisplayName,).toBe("Alice",);
    expect(ctx.userRole,).toBe("gm",);
    expect(uiStore.userRole,).toBe("gm",);
  });

  test("falls back to username then t", async () => {
    fetchHandler = () => Response.json({ username: "bob", },);
    const ctx = makeCtx();
    await chatLifecycle.loadUserInfo!.call(ctx,);
    expect(ctx.userDisplayName,).toBe("bob",);
    expect(ctx.userRole,).toBe("solo",);
  });

  test("swallows non-ok responses silently", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    const ctx = makeCtx({ userDisplayName: "keep", },);
    await chatLifecycle.loadUserInfo!.call(ctx,);
    expect(ctx.userDisplayName,).toBe("keep",);
  });

  test("swallows network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const ctx = makeCtx();
    await chatLifecycle.loadUserInfo!.call(ctx,);
    // no throw
  });
},);

describeOrSkip("chatLifecycle.loadChats", () => {
  test("sets chats from { data } payload", async () => {
    fetchHandler = () =>
      Response.json({
        data: [{ id: "a", }, { id: "b", },],
        pagination: { total: 2, page: 1, pageSize: 200, totalPages: 1, },
      },);

    const ctx = makeCtx();
    await chatLifecycle.loadChats!.call(ctx,);
    expect(ctx.chats,).toEqual([{ id: "a", }, { id: "b", },],);
  });

  test("does not overwrite chats and dispatches toast on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    const dispatch = mock(() => {},);
    const ctx = makeCtx({ $dispatch: dispatch, chats: [{ id: "old", },], },);
    await chatLifecycle.loadChats!.call(ctx,);
    expect(ctx.chats,).toEqual([{ id: "old", },],);
    expect(dispatch,).toHaveBeenCalled();
  });

  test("dispatches toast on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const dispatch = mock(() => {},);
    const ctx = makeCtx({ $dispatch: dispatch, },);
    await chatLifecycle.loadChats!.call(ctx,);
    expect(dispatch,).toHaveBeenCalled();
  });

  test("calls _filterParams for url", async () => {
    fetchHandler = () => Response.json({ data: [], },);
    const filter = mock(() => "foo=bar");
    const ctx = makeCtx({ _filterParams: filter, },);
    await chatLifecycle.loadChats!.call(ctx,);
    expect(filter,).toHaveBeenCalled();
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats?foo=bar",);
  });
},);
