import "./i18n.test-helper";
import { afterAll, afterEach, describe, expect, mock, test, } from "bun:test";
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

// tests/setup-globals.ts installs a shared globalThis.document for all frontend
// tests: extend it for these tests (querySelector: null) and restore after,
// so later files keep a working DOM shim (showToast needs querySelector).
const originalDocument = globalThis.document;
const messagesDocument = {
  ...originalDocument,
  createElement: (tag: string,) => {
    const el: any = { style: {}, value: "", tagName: tag.toUpperCase(), };
    Object.defineProperty(el, "scrollHeight", { value: 20, writable: true, configurable: true, },);
    if (tag === "textarea") { el.scrollHeight = 20; }
    return el;
  },
  querySelector: null,
} as any;
globalThis.document = messagesDocument;
afterAll(() => {
  globalThis.document = originalDocument;
},);

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
      // 11c88484 added seen-poller (re)arming to loadMessages; the plain mock
      // must expose the mixin methods it now calls.
      stopSeenPolling: () => {},
      startSeenPolling: () => {},
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

describe("chatMessages coverage", () => {
  afterEach(() => {
    fetchCalls = [];
    fetchHandler = null;
    // Restore querySelector to the baseline null default so cross-test bleed cannot happen.
    globalThis.document.querySelector = null as any;
  },);

  describe("loadOlderMessages", () => {
    test("prepends older messages and restores scroll position", async () => {
      const initialMessages: Message[] = [mockMessage("new-1",), mockMessage("new-2",),];
      const olderMessages: Message[] = [mockMessage("old-1",), mockMessage("old-2",), mockMessage("old-3",),];
      const state = {
        activeChat: "chat-1",
        messages: [...initialMessages,],
        currentPage: 1,
        totalPages: 3,
        hasMoreMessages: true,
        loadingOlder: false,
        $dispatch: () => {},
        $refs: { messageList: { scrollHeight: 0, scrollTop: 0, } as any, },
      } as unknown as ChatState;
      // Capture prev scrollHeight before fetch resolves.
      // scrollHeight grows when the messages array is prepended (proxy to messages.length).
      Object.defineProperty(state.$refs.messageList, "scrollHeight", {
        get() {
          return state.messages.length * 100;
        },
        configurable: true,
      },);

      mockFetch(200, {
        data: olderMessages,
        pagination: { total: 9, page: 2, pageSize: 50, totalPages: 3, },
      },);
      await chatMessages.loadOlderMessages!.call(state as ChatState,);

      // Older messages are prepended (oldest first).
      expect(state.messages.map((m,) => m.id),).toEqual(["old-1", "old-2", "old-3", "new-1", "new-2",],);
      expect(state.currentPage,).toBe(2,);
      expect(state.totalPages,).toBe(3,);
      expect(state.hasMoreMessages,).toBe(true,);
      expect(state.loadingOlder,).toBe(false,);
      // Scroll restoration: scrollTop set to (newScrollHeight - prevScrollHeight).
      expect(state.$refs.messageList!.scrollTop,).toBeGreaterThan(0,);
      // Pagination URL uses next page.
      expect(fetchCalls[0]?.url,).toBe("/api/chats/chat-1/messages?page=2&pageSize=50",);
    });

    test("no-ops when loadingOlder is already true", async () => {
      const state = {
        activeChat: "chat-1",
        messages: [],
        currentPage: 1,
        totalPages: 5,
        hasMoreMessages: true,
        loadingOlder: true,
        $dispatch: () => {},
        $refs: {},
      } as unknown as ChatState;
      await chatMessages.loadOlderMessages!.call(state as ChatState,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("no-ops when hasMoreMessages is false", async () => {
      const state = {
        activeChat: "chat-1",
        messages: [],
        currentPage: 5,
        totalPages: 5,
        hasMoreMessages: false,
        loadingOlder: false,
        $dispatch: () => {},
        $refs: {},
      } as unknown as ChatState;
      await chatMessages.loadOlderMessages!.call(state as ChatState,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("no-ops without an active chat", async () => {
      const state = {
        activeChat: null,
        messages: [],
        currentPage: 1,
        totalPages: 5,
        hasMoreMessages: true,
        loadingOlder: false,
        $dispatch: () => {},
        $refs: {},
      } as unknown as ChatState;
      await chatMessages.loadOlderMessages!.call(state as ChatState,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("marks hasMoreMessages=false and clears loadingOlder when server returns empty page", async () => {
      const state = {
        activeChat: "chat-1",
        messages: [mockMessage("m1",),],
        currentPage: 3,
        totalPages: 3,
        hasMoreMessages: true,
        loadingOlder: false,
        $dispatch: () => {},
        $refs: {},
      } as unknown as ChatState;
      mockFetch(200, {
        data: [],
        pagination: { total: 1, page: 4, pageSize: 50, totalPages: 3, },
      },);
      await chatMessages.loadOlderMessages!.call(state as ChatState,);
      expect(state.hasMoreMessages,).toBe(false,);
      expect(state.loadingOlder,).toBe(false,);
      // No prepending when data is empty.
      expect(state.messages,).toHaveLength(1,);
    });

    test("drops stale response if user switched chats mid-fetch", async () => {
      let release: ((r: Response,) => void) | null = null;
      fetchHandler = (_url, _opts,) =>
        new Promise<Response>((resolve,) => {
          release = resolve;
        },);
      const state = {
        activeChat: "chat-a",
        messages: [mockMessage("keep",),],
        currentPage: 1,
        totalPages: 5,
        hasMoreMessages: true,
        loadingOlder: false,
        $dispatch: () => {},
        $refs: {},
      } as unknown as ChatState;
      const pending = chatMessages.loadOlderMessages!.call(state as ChatState,);
      state.activeChat = "chat-b";
      release!(Response.json({
        data: [mockMessage("stale",),],
        pagination: { total: 1, page: 2, pageSize: 50, totalPages: 3, },
      },),);
      await pending;
      // Stale response must NOT mutate state.
      expect(state.messages.map((m,) => m.id),).toEqual(["keep",],);
      expect(state.currentPage,).toBe(1,);
      expect(state.loadingOlder,).toBe(false,);
    });

    test("emits error toast when the fetch throws", async () => {
      fetchHandler = () => {
        throw new Error("network down",);
      };
      const toasts: Array<{ type: string; message: string }> = [];
      const state = {
        activeChat: "chat-1",
        messages: [],
        currentPage: 1,
        totalPages: 5,
        hasMoreMessages: true,
        loadingOlder: false,
        $dispatch: (event: string, detail: { type: string; message: string },) => {
          if (event === "show-toast") { toasts.push(detail,); }
        },
        $refs: {},
      } as unknown as ChatState;
      await chatMessages.loadOlderMessages!.call(state as ChatState,);
      expect(state.loadingOlder,).toBe(false,);
      expect(toasts,).toHaveLength(1,);
      expect(toasts[0]?.type,).toBe("error",);
    });
  });

  describe("setupInfiniteScroll", () => {
    test("disconnects a prior observer before wiring a new one", () => {
      const disconnect = mock(() => {},);
      const observe = mock((_el: Element,) => {},);
      class FakeObserver {
        disconnected = false;
        observed: Element[] = [];
        disconnect(): void {
          this.disconnected = true;
          disconnect();
        }
        observe(el: Element,): void {
          this.observed.push(el,);
          observe(el,);
        }
      }
      const sentinel = { id: "scroll-sentinel", };
      globalThis.document.querySelector = ((sel: string,) => sel === "#scroll-sentinel" ? sentinel : null) as any;
      const OriginalIO = (globalThis as any).IntersectionObserver;
      (globalThis as any).IntersectionObserver = FakeObserver;
      try {
        const state = { scrollObserver: { disconnect, observe, } as any, loadOlderMessages: () => {}, };
        chatMessages.setupInfiniteScroll!.call(state as any,);
        // Old observer disconnected and nulled; new observer installed.
        expect(disconnect,).toHaveBeenCalledTimes(1,);
        expect(state.scrollObserver,).toBeInstanceOf(FakeObserver,);
        // Sentinel wired up via observe().
        expect((observe.mock.calls as unknown[][])[0]?.[0],).toBe(sentinel,);
        // Trigger the intersection callback: must call loadOlderMessages.
        const triggered: string[] = [];
        state.scrollObserver = undefined as any;
        const state2 = {
          scrollObserver: null as any,
          loadOlderMessages: () => {
            triggered.push("called",);
          },
        };
        chatMessages.setupInfiniteScroll!.call(state2 as any,);
        // Reach into the captured constructor to fire the callback.
        // Pull the entries handler from the constructor mock — easier: use lastInstance directly.
        // Re-run to capture handler:
        let capturedHandler: ((entries: Array<{ isIntersecting: boolean }>,) => void) | null = null;
        const CapturingObserver = function(cb: any,) {
          capturedHandler = cb;
          return new FakeObserver();
        };
        (globalThis as any).IntersectionObserver = CapturingObserver;
        const state3 = {
          scrollObserver: null as any,
          loadOlderMessages: () => {
            triggered.push("called",);
          },
        };
        chatMessages.setupInfiniteScroll!.call(state3 as any,);
        capturedHandler!([{ isIntersecting: true, },],);
        expect(triggered,).toContain("called",);
        // Non-intersecting entries are ignored.
        triggered.length = 0;
        capturedHandler!([{ isIntersecting: false, },],);
        expect(triggered,).toEqual([],);
      } finally {
        (globalThis as any).IntersectionObserver = OriginalIO;
        globalThis.document.querySelector = null as any;
      }
    });
  });

  describe("scrollToBottom", () => {
    test("schedules scrollTop assignment via setTimeout", async () => {
      const realSetTimeout = globalThis.setTimeout;
      const originalQS = globalThis.document.querySelector;
      let scrollTopSet = 0;
      let scrollHeightRead = 0;
      const fakeEl = {
        get scrollHeight(): number {
          return scrollHeightRead;
        },
        set scrollTop(v: number,) {
          scrollTopSet = v;
        },
      };
      globalThis.document.querySelector = ((sel: string,) => sel === "#message-list" ? fakeEl : null) as any;
      try {
        scrollHeightRead = 1234;
        chatMessages.scrollToBottom!();
        // Wait for the 50ms setTimeout to fire.
        await new Promise((r,) => realSetTimeout(r, 80,));
        expect(scrollTopSet,).toBe(1234,);
      } finally {
        globalThis.document.querySelector = originalQS;
      }
    });
  });

  describe("setupScrollDetection", () => {
    test("attaches scroll handler and toggles _isScrolledUp at boundary", () => {
      const realQS = globalThis.document.querySelector;
      const handlers: Array<() => void> = [];
      const fakeEl: any = {
        _scrollHeight: 1000,
        _scrollTop: 0,
        _clientHeight: 900,
        addEventListener(event: string, h: () => void,) {
          if (event === "scroll") { handlers.push(h,); }
        },
        get scrollHeight(): number {
          return this._scrollHeight;
        },
        get scrollTop(): number {
          return this._scrollTop;
        },
      };
      Object.defineProperty(fakeEl, "clientHeight", { value: 900, configurable: true, },);
      globalThis.document.querySelector = ((sel: string,) => sel === "#message-list" ? fakeEl : null) as any;
      try {
        const state: any = {};
        chatMessages.setupScrollDetection!.call(state,);
        expect(handlers,).toHaveLength(1,);
        expect(state._scrollEl,).toBe(fakeEl,);
        expect(state._isScrolledUp,).toBe(false,);
        expect(typeof state._scrollHandler,).toBe("function",);

        // Exact threshold: diff = 1000 - 0 - 900 = 100, NOT < 100 → atBottom=false → _isScrolledUp=true.
        state._scrollHandler();
        expect(state._isScrolledUp,).toBe(true,);

        // Scrolled well past threshold: diff = 1000 - 500 - 900 = -400, NOT < 100... wait — diff<100 is atBottom=true. So scrollTop=500 ⇒ atBottom=true ⇒ _isScrolledUp=false.
        fakeEl._scrollTop = 500;
        state._scrollHandler();
        expect(state._isScrolledUp,).toBe(false,);
        // Truly scrolled up: scrollTop so high diff is positive and large.
        fakeEl._scrollTop = 50; // diff = 1000 - 50 - 900 = 50 < 100 → atBottom=true. Use scrollTop=10: diff=90<100.
        state._scrollHandler();
        expect(state._isScrolledUp,).toBe(false,);
        fakeEl._scrollTop = 0; // diff = 100 → atBottom=false → _isScrolledUp=true.
        state._scrollHandler();
        expect(state._isScrolledUp,).toBe(true,);
      } finally {
        globalThis.document.querySelector = realQS;
      }
    });

    test("flips _isScrolledUp when user is far from the bottom", () => {
      const realQS = globalThis.document.querySelector;
      const fakeEl: any = {
        scrollHeight: 2000,
        scrollTop: 1500,
        clientHeight: 200,
        addEventListener: () => {},
      };
      globalThis.document.querySelector = ((sel: string,) => sel === "#message-list" ? fakeEl : null) as any;
      try {
        const state: any = {};
        chatMessages.setupScrollDetection!.call(state,);
        // diff = 2000 - 1500 - 200 = 300, NOT < 100 → atBottom=false → _isScrolledUp=true.
        // The handler is _scrollHandler; invoke it:
        state._scrollHandler();
        expect(state._isScrolledUp,).toBe(true,);
      } finally {
        globalThis.document.querySelector = realQS;
      }
    });

    test("no-ops when the message list element is missing", () => {
      globalThis.document.querySelector = (() => null) as any;
      const state: any = {};
      chatMessages.setupScrollDetection!.call(state,);
      expect(state._scrollEl,).toBeUndefined();
      expect(state._scrollHandler,).toBeUndefined();
    });
  });

  describe("scrollToBottomSmooth", () => {
    test("calls scrollTo with smooth behavior and resets _isScrolledUp", () => {
      const realQS = globalThis.document.querySelector;
      let scrollToArg: { top: number; behavior: string } | null = null;
      const fakeEl: any = {
        scrollHeight: 800,
        scrollTo(opts: { top: number; behavior: string },) {
          scrollToArg = opts;
        },
      };
      globalThis.document.querySelector = ((sel: string,) => sel === "#message-list" ? fakeEl : null) as any;
      try {
        const state: any = { _isScrolledUp: true, };
        chatMessages.scrollToBottomSmooth!.call(state,);
        expect(scrollToArg as unknown as { top: number; behavior: string },).toEqual({
          top: 800,
          behavior: "smooth",
        },);
        expect(state._isScrolledUp,).toBe(false,);
      } finally {
        globalThis.document.querySelector = realQS;
      }
    });

    test("no-ops when the message list element is missing", () => {
      globalThis.document.querySelector = (() => null) as any;
      const state: any = { _isScrolledUp: true, };
      chatMessages.scrollToBottomSmooth!.call(state,);
      expect(state._isScrolledUp,).toBe(true,);
    });
  });
});
