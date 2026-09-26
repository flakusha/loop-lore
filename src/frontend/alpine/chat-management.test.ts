// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { chatManagement, } from "./chat-management";

// ── Mock apiFetch (chat-management imports ./htmx; keep the real i18n) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

const originalAlpine = (globalThis as Record<string, unknown>).Alpine;
const originalConfirm = globalThis.confirm;
const uiStore: Record<string, unknown> = {};

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  for (const k of Object.keys(uiStore,)) { delete uiStore[k]; }
  (globalThis as Record<string, unknown>).Alpine = {
    store: (name: string,) => {
      if (name === "ui") { return uiStore; }
      return {};
    },
  };
  globalThis.confirm = () => true;
},);

afterEach(() => {
  (globalThis as Record<string, unknown>).Alpine = originalAlpine;
  globalThis.confirm = originalConfirm;
},);

function mgmtCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  const toasts: { type: string; message: string }[] = [];
  return {
    chats: [],
    activeChat: null,
    activeChatName: "",
    messages: [],
    selectedChats: [],
    _renameChatId: "",
    _renameChatName: "",
    $dispatch: (e: string, d: { type: string; message: string },) => {
      if (e === "show-toast") { toasts.push(d,); }
    },
    toasts,
    ...overrides,
  };
}

const chatRow = (id: string, name = "Chat", isPinned: number | boolean = 0,): Record<string, unknown> => ({
  id,
  name,
  isPinned,
});

describe("chatManagement.toggleChatSelection", () => {
  test("adds and removes ids", () => {
    const ctx = mgmtCtx({ selectedChats: [], },);
    chatManagement.toggleChatSelection!.call(ctx, "c1",);
    expect(ctx.selectedChats,).toEqual(["c1",],);
    chatManagement.toggleChatSelection!.call(ctx, "c2",);
    expect(ctx.selectedChats,).toEqual(["c1", "c2",],);
    chatManagement.toggleChatSelection!.call(ctx, "c1",);
    expect(ctx.selectedChats,).toEqual(["c2",],);
  });

  test("handles unicode ids", () => {
    const ctx = mgmtCtx({ selectedChats: [], },);
    chatManagement.toggleChatSelection!.call(ctx, "chat-酒場-1",);
    expect(ctx.selectedChats,).toEqual(["chat-酒場-1",],);
  });
});

describe("chatManagement.toggleChatPin", () => {
  test("ignores unknown chats without fetching", async () => {
    const ctx = mgmtCtx({ chats: [], },);
    await chatManagement.toggleChatPin!.call(ctx, "missing",);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("flips the pin and refreshes the list", async () => {
    mockFetch(200, {},);
    const chats = [chatRow("c1", "General", 0,),];
    const ctx = mgmtCtx({ chats, },);
    await chatManagement.toggleChatPin!.call(ctx, "c1",);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/c1",);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ isPinned: true, },);
    expect(chats[0]!.isPinned,).toBe(1,);
    expect(ctx.chats === chats,).toBe(false,);
  });

  test("unpins a pinned chat", async () => {
    mockFetch(200, {},);
    const chats = [chatRow("c1", "General", 1,),];
    const ctx = mgmtCtx({ chats, },);
    await chatManagement.toggleChatPin!.call(ctx, "c1",);
    expect(chats[0]!.isPinned,).toBe(0,);
  });

  test("toasts on failure and keeps the pin", async () => {
    mockFetch(500, { error: "no", },);
    const chats = [chatRow("c1", "General", 0,),];
    const ctx = mgmtCtx({ chats, },);
    await chatManagement.toggleChatPin!.call(ctx, "c1",);
    expect(chats[0]!.isPinned,).toBe(0,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });
});

describe("chatManagement.openRenameModal", () => {
  test("seeds the modal from the chat name", () => {
    const ctx = mgmtCtx({ chats: [chatRow("c1", "General",),], },);
    chatManagement.openRenameModal!.call(ctx, "c1",);
    expect(ctx._renameChatId,).toBe("c1",);
    expect(ctx._renameChatName,).toBe("General",);
    expect(uiStore.showRenameModal,).toBe(true,);
  });

  test("falls back to the untitled label for unknown chats", () => {
    const ctx = mgmtCtx({ chats: [], },);
    chatManagement.openRenameModal!.call(ctx, "missing",);
    expect(ctx._renameChatId,).toBe("missing",);
    expect(typeof ctx._renameChatName,).toBe("string",);
    expect((ctx._renameChatName as string).length,).toBeGreaterThan(0,);
  });

  test("renameChat delegates to openRenameModal", async () => {
    const opened: string[] = [];
    const ctx = mgmtCtx({
      openRenameModal: (id: string,) => {
        opened.push(id,);
      },
    },);
    await chatManagement.renameChat!.call(ctx, "c9",);
    expect(opened,).toEqual(["c9",],);
  });
});

describe("chatManagement.confirmRenameChat", () => {
  test("hides the modal for blank names without fetching", async () => {
    uiStore.showRenameModal = true;
    const ctx = mgmtCtx({ chats: [chatRow("c1", "Old",),], _renameChatId: "c1", _renameChatName: "   ", },);
    await chatManagement.confirmRenameChat!.call(ctx,);
    expect(uiStore.showRenameModal,).toBe(false,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("hides the modal when the name is unchanged", async () => {
    uiStore.showRenameModal = true;
    const ctx = mgmtCtx({ chats: [chatRow("c1", "Same",),], _renameChatId: "c1", _renameChatName: "Same", },);
    await chatManagement.confirmRenameChat!.call(ctx,);
    expect(uiStore.showRenameModal,).toBe(false,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("renames an inactive chat on success", async () => {
    mockFetch(200, {},);
    const chats = [chatRow("c1", "Old",),];
    const ctx = mgmtCtx({
      chats,
      activeChat: "other",
      activeChatName: "Other",
      _renameChatId: "c1",
      _renameChatName: "  New Name  ",
    },);
    await chatManagement.confirmRenameChat!.call(ctx,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/c1",);
    expect(chats[0]!.name,).toBe("New Name",);
    expect(uiStore.showRenameModal,).toBe(false,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("success",);
  });

  test("toasts server errors", async () => {
    mockFetch(400, { error: "taken", },);
    const ctx = mgmtCtx({
      chats: [chatRow("c1", "Old",),],
      _renameChatId: "c1",
      _renameChatName: "New",
    },);
    await chatManagement.confirmRenameChat!.call(ctx,);
    expect((ctx.toasts as { type: string; message: string }[])[0],).toMatchObject({
      type: "error",
      message: "taken",
    },);
  });
});

describe("chatManagement.batchArchive", () => {
  test("returns early with no selection", async () => {
    const ctx = mgmtCtx({ selectedChats: [], },);
    await chatManagement.batchArchive!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("archives and clears the selection", async () => {
    mockFetch(200, {},);
    const ctx = mgmtCtx({
      chats: [chatRow("c1",), chatRow("c2",),],
      selectedChats: ["c1",],
    },);
    await chatManagement.batchArchive!.call(ctx,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/batch/archive",);
    expect((ctx.chats as Record<string, unknown>[]).map((c,) => c.id),).toEqual(["c2",],);
    expect(ctx.selectedChats,).toEqual([],);
  });

  test("toasts server errors and keeps the rows", async () => {
    mockFetch(400, { error: "no", },);
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], selectedChats: ["c1",], },);
    await chatManagement.batchArchive!.call(ctx,);
    expect(ctx.chats as unknown[],).toHaveLength(1,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });
});

describe("chatManagement.batchDelete", () => {
  test("returns early with no selection", async () => {
    const ctx = mgmtCtx({ selectedChats: [], },);
    await chatManagement.batchDelete!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("aborts when confirm is declined", async () => {
    globalThis.confirm = () => false;
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], selectedChats: ["c1",], },);
    await chatManagement.batchDelete!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx.chats as unknown[],).toHaveLength(1,);
  });

  test("deletes inactive chats and resets the selection", async () => {
    mockFetch(200, {},);
    const ctx = mgmtCtx({
      chats: [chatRow("c1",), chatRow("c2",),],
      activeChat: "c2",
      selectedChats: ["c1",],
    },);
    await chatManagement.batchDelete!.call(ctx,);
    expect((ctx.chats as Record<string, unknown>[]).map((c,) => c.id),).toEqual(["c2",],);
    expect(ctx.selectedChats,).toEqual([],);
    expect(ctx.activeChat,).toBe("c2",);
  });

  test("deleting the active chat clears the view", async () => {
    mockFetch(200, {},);
    const ctx = mgmtCtx({
      chats: [chatRow("c1",),],
      activeChat: "c1",
      messages: [{ id: "m1", },],
      selectedChats: ["c1",],
    },);
    await chatManagement.batchDelete!.call(ctx,);
    expect(ctx.activeChat,).toBeNull();
    expect(ctx.messages,).toEqual([],);
    expect(uiStore.hasActiveChat,).toBe(false,);
  });

  test("toasts network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], selectedChats: ["c1",], },);
    await chatManagement.batchDelete!.call(ctx,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });
});

describe("chatManagement.batchExport", () => {
  test("returns early with no selection", async () => {
    const ctx = mgmtCtx({ selectedChats: [], },);
    await chatManagement.batchExport!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("toasts server errors without touching the DOM", async () => {
    mockFetch(400, { error: "no", },);
    const ctx = mgmtCtx({ selectedChats: ["c1",], },);
    await chatManagement.batchExport!.call(ctx,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });

  test("toasts network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = mgmtCtx({ selectedChats: ["c1",], },);
    await chatManagement.batchExport!.call(ctx,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });
});

describe("chatManagement.deleteChat", () => {
  const delEvent = () => {
    let stopped = 0;
    let blurred = 0;
    return {
      event: {
        stopImmediatePropagation: () => {
          stopped++;
        },
        currentTarget: {
          blur: () => {
            blurred++;
          },
        },
      } as unknown as Event,
      counts: () => ({ stopped, blurred, }),
    };
  };

  test("deletes an inactive chat and blurs the button", async () => {
    mockFetch(200, {},);
    const { event, counts, } = delEvent();
    const ctx = mgmtCtx({ chats: [chatRow("c1",), chatRow("c2",),], activeChat: "c2", },);
    await chatManagement.deleteChat!.call(ctx, "c1", event,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/c1",);
    expect((ctx.chats as Record<string, unknown>[]).map((c,) => c.id),).toEqual(["c2",],);
    expect(ctx.activeChat,).toBe("c2",);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("success",);
    expect(counts(),).toEqual({ stopped: 1, blurred: 1, },);
  });

  test("deleting the active chat resets the view", async () => {
    mockFetch(200, {},);
    const { event, } = delEvent();
    const ctx = mgmtCtx({
      chats: [chatRow("c1",),],
      activeChat: "c1",
      messages: [{ id: "m1", },],
    },);
    await chatManagement.deleteChat!.call(ctx, "c1", event,);
    expect(ctx.activeChat,).toBeNull();
    expect(ctx.messages,).toEqual([],);
    expect(uiStore.hasActiveChat,).toBe(false,);
  });

  test("aborts when confirm is declined", async () => {
    globalThis.confirm = () => false;
    const { event, counts, } = delEvent();
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], },);
    await chatManagement.deleteChat!.call(ctx, "c1", event,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(counts().stopped,).toBe(0,);
  });

  test("toasts server errors and keeps the row", async () => {
    mockFetch(400, { error: "locked", },);
    const { event, } = delEvent();
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], },);
    await chatManagement.deleteChat!.call(ctx, "c1", event,);
    expect(ctx.chats as unknown[],).toHaveLength(1,);
    expect((ctx.toasts as { type: string; message: string }[])[0],).toMatchObject({
      type: "error",
      message: "locked",
    },);
  });

  test("toasts network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const { event, } = delEvent();
    const ctx = mgmtCtx({ chats: [chatRow("c1",),], },);
    await chatManagement.deleteChat!.call(ctx, "c1", event,);
    expect((ctx.toasts as { type: string }[])[0]?.type,).toBe("error",);
  });
});
