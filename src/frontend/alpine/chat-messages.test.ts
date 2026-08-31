import "./i18n.test-helper";
import { afterEach, describe, expect, test, } from "bun:test";
import { chatMessages, } from "./chat-messages";
import type { ChatState, Message, } from "./types";

// ── Mock global apiFetch (chat-messages uses bare `apiFetch` = globalThis.apiFetch) ──
// htmx.ts assigns globalThis.apiFetch at import; mocking the `./htmx` module export
// would NOT intercept the global binding used here, so we stub globalThis directly.
// i18n uses the REAL module via i18n.test-helper above.
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response | Promise<Response>) | null = null;

type ApiFetch = (url: string, options?: RequestInit,) => Promise<Response>;
const globalApiFetch = globalThis as typeof globalThis & { apiFetch?: ApiFetch };
globalApiFetch.apiFetch = async (url: string, opts?: RequestInit,) => {
  fetchCalls.push({ url, opts: opts ?? {}, },);
  if (!fetchHandler) { return new Response("{}", { status: 200, },); }
  return fetchHandler(url, opts ?? {},);
};

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

/** Test state whose `messages` is always defined (narrowed from Partial<ChatState>). */
type ReactionState = Partial<ChatState> & { messages: Message[] };

const mockMessage = (id: string, role = "user",): Message => ({
  id,
  role,
  content: "hi",
  created_at: new Date().toISOString(),
});

globalThis.document = {
  createElement: (tag: string,) => {
    const el: any = { style: {}, value: "", tagName: tag.toUpperCase(), };
    Object.defineProperty(el, "scrollHeight", { value: 20, writable: true, configurable: true, },);
    if (tag === "textarea") { el.scrollHeight = 20; }
    return el;
  },
  querySelector: null,
} as any;

describe("chatMessages", () => {
  describe("autoResize", () => {
    test("resizes textarea based on content", () => {
      const textarea = document.createElement("textarea",);
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 60, writable: true, configurable: true, },);

      chatMessages.autoResize!.call({}, textarea,);

      expect(textarea.style.height,).toBe("60px",);
    });

    test("caps height at 200px", () => {
      const textarea = document.createElement("textarea",);
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 500, writable: true, configurable: true, },);

      chatMessages.autoResize!.call({}, textarea,);

      expect(textarea.style.height,).toBe("200px",);
    });

    test("handles empty textarea", () => {
      const textarea = document.createElement("textarea",);
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 20, writable: true, configurable: true, },);

      chatMessages.autoResize!.call({}, textarea,);

      expect(textarea.style.height,).toBe("20px",);
    });
  });

  describe("scrollToBottom", () => {
    test("handles missing element gracefully", () => {
      document.querySelector = () => null;
      expect(() => chatMessages.scrollToBottom!()).not.toThrow();
    });
  });

  describe("setupInfiniteScroll", () => {
    test("does nothing when sentinel not found", () => {
      document.querySelector = () => null;
      expect(() => chatMessages.setupInfiniteScroll!.call({ scrollObserver: null, loadOlderMessages: () => {}, },)).not
        .toThrow();
    });
  });

  describe("toggleReaction", () => {
    afterEach(() => {
      fetchCalls = [];
      fetchHandler = null;
    },);

    test("POSTs the emoji then reloads reactions for the message", async () => {
      fetchHandler = (url, opts,) => {
        if (url === "/api/messages/msg-1/reactions" && opts?.method === "POST") {
          return Response.json({ toggled: true, emoji: "👍", },);
        }
        return Response.json([{ emoji: "👍", count: 1, userReacted: true, },], { status: 200, },);
      };
      const state: ReactionState = {
        activeChat: "chat-1",
        messages: [mockMessage("msg-1",),],
        loadMessageReactions: chatMessages.loadMessageReactions,
      };

      await chatMessages.toggleReaction!.call(state, "msg-1", "👍",);

      const post = fetchCalls.find((c,) => c.opts?.method === "POST");
      expect(post?.url,).toBe("/api/messages/msg-1/reactions",);
      const rawBody = post?.opts?.body;
      const bodyStr = typeof rawBody === "string" ? rawBody : "";
      const body = JSON.parse(bodyStr,) as { emoji: string };
      expect(body.emoji,).toBe("👍",);
      expect(state.messages[0]!.reactions,).toEqual([{ emoji: "👍", count: 1, userReacted: true, },],);
    });

    test("does nothing without an active chat", async () => {
      const state: ReactionState = { activeChat: null, messages: [], };
      await chatMessages.toggleReaction!.call(state, "msg-1", "👍",);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("silently swallows API errors", async () => {
      fetchHandler = () => new Response("{}", { status: 500, },);
      const state: ReactionState = {
        activeChat: "chat-1",
        messages: [],
        loadMessageReactions: chatMessages.loadMessageReactions,
      };
      await expect(chatMessages.toggleReaction!.call(state, "msg-1", "👍",),).resolves.toBeUndefined();
    });
  });

  describe("loadMessageReactions", () => {
    afterEach(() => {
      fetchCalls = [];
      fetchHandler = null;
    },);

    test("stores grouped reactions on the matching message", async () => {
      mockFetch(200, [{ emoji: "❤️", count: 2, userReacted: false, },],);
      const state: ReactionState = { messages: [mockMessage("msg-1",), mockMessage("msg-2",),], };

      await chatMessages.loadMessageReactions!.call(state, "msg-2",);

      expect(fetchCalls,).toHaveLength(1,);
      expect(fetchCalls[0]!.url,).toBe("/api/messages/msg-2/reactions",);
      expect(state.messages[1]!.reactions,).toEqual([{ emoji: "❤️", count: 2, userReacted: false, },],);
    });

    test("leaves messages untouched on error", async () => {
      mockFetch(500, {},);
      const state: ReactionState = { messages: [mockMessage("msg-1",),], };
      await chatMessages.loadMessageReactions!.call(state, "msg-1",);
      expect(state.messages[0]!.reactions,).toBeUndefined();
    });
  });
});

describe("loadMessages stale-response guard", () => {
  test("slow response for old chat does not overwrite switched-to chat state", async () => {
    afterEach(() => {
      // Deterministic teardown: this suite reassigns the file-global mock fetch;
      // reset it so later suites never inherit a pending deferred handler.
      fetchHandler = null;
      fetchCalls = [];
    },);
    const state = {
      activeChat: "chat-a" as string | null,
      messages: [] as Message[],
      totalPages: 0,
      currentPage: 1,
      hasMoreMessages: true,
      loadingMessages: false,
      loadingError: null as string | null,
    } as ChatState;

    let releaseA: ((r: Response,) => void) | null = null;
    fetchCalls = [];
    fetchHandler = (_url, _opts,) =>
      new Promise<Response>((resolve,) => {
        releaseA = resolve;
      },);

    const pending = chatMessages.loadMessages!.call(state,);
    // User switches chats while A's fetch is still in flight.
    state.activeChat = "chat-b";
    releaseA!(Response.json({
      data: [{ ...mockMessage("m1",), },],
      pagination: { total: 1, page: 1, pageSize: 50, totalPages: 1, },
    },),);
    await pending;

    // Stale response must not clobber the new chat's (empty) message list.
    expect(state.messages,).toEqual([],);
    expect(state.totalPages,).toBe(0,);
    expect(state.loadingMessages,).toBe(false,);
  });
});
