import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatPartySplit, } from "./chat-party-split";
import type { ChatState, } from "./types";

let fetchCalls: { url: string; args: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, args: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

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

/**
 * @param overrides
 */
function buildCtx(
  overrides: { activeChat?: string | null; toasts?: Toast[]; loaded?: string[] } = {},
): ChatState {
  const toasts: Toast[] = overrides.toasts ?? [];
  const loaded: string[] = overrides.loaded ?? [];
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat === undefined ? "chat-1" : overrides.activeChat,
    currentChat: { id: "chat-1", type: "group", name: "Group", },
    splitBranches: [],
    splitBusy: false,
    splitError: null,
    reuniteSecondaryId: "",
    reuniteBusy: false,
    reuniteError: null,
    loadMessages: async () => {
      loaded.push("messages",);
    },
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };

  for (const name of Object.getOwnPropertyNames(chatPartySplit,)) {
    if (name === "splitBranches") { continue; }
    const desc = Object.getOwnPropertyDescriptor(chatPartySplit, name,);
    if (!desc) { continue; }
    if ("value" in desc) {
      if (typeof desc.value === "function") { base[name] = desc.value; }
    } else { Object.defineProperty(base, name, desc,); }
  }

  return base as unknown as ChatState;
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  for (const key of Object.keys(uiStore,)) { delete uiStore[key]; }
},);

describeOrSkip("chatPartySplit", () => {
  describeOrSkip("openPartySplit", () => {
    test("seeds two empty branches and opens the modal", () => {
      const state = buildCtx();
      (chatPartySplit.openPartySplit as () => void).call(state,);
      expect((state as unknown as { splitBranches: unknown[] }).splitBranches,).toHaveLength(2,);
      expect(uiStore.showPartySplit,).toBe(true,);
    });

    test("keeps an existing draft instead of reseeding", () => {
      const state = buildCtx();
      const draft = [{ locationId: "forest", actorIds: ["a1",], name: "", },];
      (state as unknown as { splitBranches: unknown[] }).splitBranches = draft;
      (chatPartySplit.openPartySplit as () => void).call(state,);
      expect((state as unknown as { splitBranches: unknown[] }).splitBranches,).toBe(draft,);
    });
  },);

  describeOrSkip("toggleSplitActor", () => {
    test("adds then removes the actor", () => {
      const state = buildCtx();
      (state as unknown as { splitBranches: { actorIds: string[] }[] }).splitBranches = [
        { locationId: "", actorIds: [], name: "", } as never,
      ] as never;

      const toggle = chatPartySplit.toggleSplitActor as (i: number, id: string,) => void;
      toggle.call(state, 0, "a1",);
      expect((state as unknown as { splitBranches: { actorIds: string[] }[] }).splitBranches[0]?.actorIds,).toEqual([
        "a1",
      ],);

      toggle.call(state, 0, "a1",);
      expect((state as unknown as { splitBranches: { actorIds: string[] }[] }).splitBranches[0]?.actorIds,).toEqual(
        [],
      );
    });

    test("ignores out-of-range branch indexes", () => {
      const state = buildCtx();
      const toggle = chatPartySplit.toggleSplitActor as (i: number, id: string,) => void;
      expect(() => toggle.call(state, 9, "a1",)).not.toThrow();
    });
  },);

  describeOrSkip("submitSplit", () => {
    test("POSTs branch specs, closes the modal, and reloads messages", async () => {
      mockFetch(201, { data: { branches: [], splitNarration: "split", }, },);
      const loaded: string[] = [];
      const state = buildCtx({ loaded, },);
      (state as unknown as { splitBranches: unknown[] }).splitBranches = [
        { locationId: "forest", actorIds: ["a1",], name: "", },
        { locationId: "cave", actorIds: ["a2",], name: "East", },
      ];

      uiStore.showPartySplit = true;
      await (chatPartySplit.submitSplit as () => Promise<void>).call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/split",);
      const sent = JSON.parse(fetchCalls[0]?.args.body as string,) as {
        branches: { locationId: string; actorIds: string[]; name?: string }[];
      };

      expect(sent.branches[0],).toEqual({ locationId: "forest", actorIds: ["a1",], },);
      expect(sent.branches[1],).toEqual({ locationId: "cave", actorIds: ["a2",], name: "East", },);
      expect(uiStore.showPartySplit,).toBe(false,);
      expect(loaded,).toEqual(["messages",],);
    });

    test("keeps the draft open and surfaces the server refusal", async () => {
      mockFetch(400, { message: "Every branch needs at least one actor", },);
      const state = buildCtx();
      const draft = [{ locationId: "", actorIds: [], name: "", },];
      (state as unknown as { splitBranches: unknown[] }).splitBranches = draft;
      uiStore.showPartySplit = true;
      await (chatPartySplit.submitSplit as () => Promise<void>).call(state,);
      expect((state as unknown as { splitError: unknown }).splitError,).toBe(
        "Every branch needs at least one actor",
      );

      expect((state as unknown as { splitBranches: unknown[] }).splitBranches,).toBe(draft,);
      expect(uiStore.showPartySplit,).toBe(true,);
    });

    test("no-ops without an active chat", async () => {
      const state = buildCtx({ activeChat: null, },);
      await (chatPartySplit.submitSplit as () => Promise<void>).call(state,);
      expect(fetchCalls,).toEqual([],);
    });
  },);

  describeOrSkip("submitReunite", () => {
    test("POSTs the secondary id and closes the modal", async () => {
      mockFetch(200, { data: { mergedMessageCount: 3, reunionNarration: "back", }, },);
      const state = buildCtx();
      (state as unknown as { reuniteSecondaryId: string }).reuniteSecondaryId = "chat-2";
      uiStore.showPartySplit = true;
      await (chatPartySplit.submitReunite as () => Promise<void>).call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/reunite",);
      const sent = JSON.parse(fetchCalls[0]?.args.body as string,) as { secondaryChatId: string };
      expect(sent,).toEqual({ secondaryChatId: "chat-2", },);
      expect(uiStore.showPartySplit,).toBe(false,);
    });

    test("surfaces the server refusal without closing", async () => {
      mockFetch(403, { message: "Only the chat owner can reunite", },);
      const state = buildCtx();
      (state as unknown as { reuniteSecondaryId: string }).reuniteSecondaryId = "chat-2";
      await (chatPartySplit.submitReunite as () => Promise<void>).call(state,);
      expect((state as unknown as { reuniteError: unknown }).reuniteError,).toBe(
        "Only the chat owner can reunite",
      );
    });
  },);
},);
