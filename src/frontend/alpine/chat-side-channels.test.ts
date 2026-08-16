import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatSideChannels, } from "./chat-side-channels";
import type { ChatState, } from "./types";

// ── Mock apiFetch (chat-side-channels imports htmx + i18n) ──
// i18n uses the REAL module via i18n.test-helper above — do NOT mock.module
// "./i18n" here: mock.module is process-global, so a t:key => key stub leaks
// into sibling test files (e.g. world-channels.test.ts) sharing the worker,
// making their toast assertions receive raw keys instead of resolved strings.
let fetchCalls: { url: string; args: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, args: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

// Alpine store stub — side-channels reads/writes $store.ui. Provide a minimal
// in-memory store so Alpine.store works outside the browser.
const uiStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).Alpine = {
  store: (name: string,) => {
    if (name === "ui") { return uiStore; }
    return {};
  },
};

interface Toast {
  type: string;
  message: string;
}

function buildCtx(
  overrides: {
    activeChat?: string | null;
    chatType?: string;
    toasts?: Toast[];
    selectChat?: (id: string,) => Promise<void>;
  } = {},
): ChatState {
  const toasts: Toast[] = overrides.toasts ?? [];
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat === undefined ? "chat-1" : overrides.activeChat,
    currentChat: { id: "chat-1", type: overrides.chatType ?? "group", name: "Group", },
    selectChat: overrides.selectChat ?? (async () => {}),
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };
  for (const name of Object.getOwnPropertyNames(chatSideChannels,)) {
    const desc = Object.getOwnPropertyDescriptor(chatSideChannels, name,);
    if (!desc) { continue; }
    if ("value" in desc) { base[name] = desc.value; }
    else { Object.defineProperty(base, name, desc,); }
  }
  return base as unknown as ChatState;
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describe("chatSideChannels", () => {
  describe("loadSideChannels", () => {
    test("fetches and stores side-channels into $store.ui", async () => {
      mockFetch(200, {
        sideChannels: [
          {
            id: "s1",
            name: "OOC",
            type: "group",
            mode: "group",
            created_by: "u1",
            world_id: null,
            created_at: "t",
            updated_at: "t",
          },
        ],
      },);
      const state = buildCtx();
      await chatSideChannels.loadSideChannels!.call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/side",);
      expect(uiStore.sideChannels,).toHaveLength(1,);
    });

    test("no-ops without an active chat", async () => {
      const state = buildCtx({ activeChat: null, },);
      await chatSideChannels.loadSideChannels!.call(state,);
      expect(fetchCalls,).toEqual([],);
    });
  });

  describe("createSideChannel", () => {
    test("POSTs, reloads, and switches to the new channel", async () => {
      mockFetch(201, { id: "s9", },);
      const selectChat = mock(async () => {},);
      const state = buildCtx({ selectChat, },);
      await chatSideChannels.createSideChannel!.call(state, "Notes",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/side",);
      expect(fetchCalls[0]?.args.method,).toBe("POST",);
      expect(JSON.parse(fetchCalls[0]?.args.body as string,),).toEqual({ name: "Notes", },);
      expect(selectChat,).toHaveBeenCalledWith("s9",);
    });

    test("toasts an error on failure", async () => {
      mockFetch(500, { error: "boom", },);
      const toasts: Toast[] = [];
      const state = buildCtx({ toasts, },);
      await chatSideChannels.createSideChannel!.call(state, "Notes",);
      expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    });
  });

  describe("switchSideChannel", () => {
    test("delegates to selectChat", async () => {
      const selectChat = mock(async () => {},);
      const state = buildCtx({ selectChat, },);
      await chatSideChannels.switchSideChannel!.call(state, "s1",);
      expect(selectChat,).toHaveBeenCalledWith("s1",);
    });
  });
});
