import "./i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatSideChannels, } from "./chat-side-channels";
import type { ChatState, } from "./types";

// ── Mock apiFetch (chat-side-channels imports htmx + i18n) ──
// i18n uses the REAL module via i18n.test-helper above — do NOT mock.module
// "./i18n" here: mock.module is process-global, so a t:key => key stub leaks
// into sibling test files (e.g. world-channels.test.ts) sharing the worker,
// making their toast assertions receive raw keys instead of resolved strings.
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

/**
 * @param overrides
 * @param overrides.activeChat
 * @param overrides.chatType
 * @param overrides.toasts
 * @param overrides.selectChat
 */
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

describeOrSkip("chatSideChannels", () => {
  describeOrSkip("loadSideChannels", () => {
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
  },);

  describeOrSkip("createSideChannel", () => {
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
  },);

  describeOrSkip("switchSideChannel", () => {
    test("delegates to selectChat", async () => {
      const selectChat = mock(async () => {},);
      const state = buildCtx({ selectChat, },);
      await chatSideChannels.switchSideChannel!.call(state, "s1",);
      expect(selectChat,).toHaveBeenCalledWith("s1",);
    });
  },);
},);

describeOrSkip("chatSideChannels — isGroupChat", () => {
  test("true for a group chat", () => {
    const state = buildCtx({ chatType: "group", },);
    expect(state.isGroupChat,).toBe(true,);
  });

  test("false for a direct chat", () => {
    const state = buildCtx({ chatType: "direct", },);
    expect(state.isGroupChat,).toBe(false,);
  });
},);

describeOrSkip("chatSideChannels — loadSideChannels boundaries", () => {
  afterEach(() => {
    fetchCalls = [];
    fetchHandler = null;
    delete uiStore.sideChannels;
  },);

  test("no-ops for a non-group chat", async () => {
    const state = buildCtx({ chatType: "direct", },);
    await chatSideChannels.loadSideChannels!.call(state,);
    expect(fetchCalls,).toEqual([],);
  });

  test("stores an empty list when the body has no sideChannels key", async () => {
    mockFetch(200, { count: 0, },);
    const state = buildCtx();
    await chatSideChannels.loadSideChannels!.call(state,);
    expect(uiStore.sideChannels,).toEqual([],);
  });

  test("swallows network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const state = buildCtx();
    await chatSideChannels.loadSideChannels!.call(state,);
    expect(uiStore.sideChannels,).toBeUndefined();
  });
},);

describeOrSkip("chatSideChannels — createSideChannel boundaries", () => {
  afterEach(() => {
    fetchCalls = [];
    fetchHandler = null;
    delete uiStore.newSideChannelName;
  },);

  test("no-ops on a blank name", async () => {
    const state = buildCtx();
    await chatSideChannels.createSideChannel!.call(state, "   ",);
    expect(fetchCalls,).toEqual([],);
  });

  test("resets newSideChannelName after a successful create", async () => {
    mockFetch(201, { id: "s9", },);
    uiStore.newSideChannelName = "Notes";
    const state = buildCtx();
    await chatSideChannels.createSideChannel!.call(state, "Notes",);
    expect(uiStore.newSideChannelName,).toBe("",);
  });

  test("toasts an error on a network exception", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const toasts: Toast[] = [];
    const state = buildCtx({ toasts, },);
    await chatSideChannels.createSideChannel!.call(state, "Notes",);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
  });
},);

describeOrSkip("chatSideChannels — switchSideChannel closes the dropdown", () => {
  afterEach(() => {
    delete uiStore.showSideChannels;
  },);

  test("sets showSideChannels to false before switching", async () => {
    uiStore.showSideChannels = true;
    const selectChat = mock(async () => {},);
    const state = buildCtx({ selectChat, },);
    await chatSideChannels.switchSideChannel!.call(state, "s1",);
    expect(uiStore.showSideChannels,).toBe(false,);
    expect(selectChat,).toHaveBeenCalledWith("s1",);
  });
},);

describeOrSkip("chatSideChannels — toggleSideChannels", () => {
  afterEach(() => {
    fetchCalls = [];
    fetchHandler = null;
    delete uiStore.showSideChannels;
  },);

  test("opens the dropdown and loads side-channels", async () => {
    mockFetch(200, { sideChannels: [], },);
    const state = buildCtx();
    await chatSideChannels.toggleSideChannels!.call(state,);
    expect(uiStore.showSideChannels,).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("closes the dropdown without loading", async () => {
    uiStore.showSideChannels = true;
    const state = buildCtx();
    await chatSideChannels.toggleSideChannels!.call(state,);
    expect(uiStore.showSideChannels,).toBe(false,);
    expect(fetchCalls,).toEqual([],);
  });
},);

/**
 * The header-facing globals must no-op in the pre-Alpine-boot window. The
 * `createSideChannel` global reads `$store.ui.newSideChannelName`, so it can
 * only do that AFTER the chatState scope is known to exist — otherwise the
 * read throws `ReferenceError: Alpine is not defined`.
 */
describeOrSkip("side-channel header globals — absent-Alpine no-op", () => {
  const g = globalThis as Record<string, unknown>;
  let realAlpine: unknown;
  let realDocument: unknown;

  beforeEach(() => {
    realAlpine = g.Alpine;
    realDocument = g.document;
  },);

  afterEach(() => {
    if (realAlpine === undefined) {
      delete g.Alpine;
    } else {
      g.Alpine = realAlpine;
    }
    g.document = realDocument;
  },);

  /** Point the chatState lookup at a stub element (null = no scope mounted). */
  function stubScope(el: unknown,): void {
    g.document = { querySelector: () => el, } as unknown as Document;
  }

  test("createSideChannel does not read $store.ui when Alpine is undefined", async () => {
    stubScope({},);
    delete g.Alpine;
    // Threw `ReferenceError: Alpine is not defined` before the guard was added.
    await (g.createSideChannel as () => Promise<void>)();
  });

  test("createSideChannel does not read $store.ui when the scope is absent", async () => {
    stubScope(null,);
    g.Alpine = { store: () => ({}), $data: () => ({}), };
    await (g.createSideChannel as () => Promise<void>)();
  });

  test("createSideChannel passes the typed name through to the action", async () => {
    const createSideChannel = mock(async () => {},);
    const el = {};
    stubScope(el,);
    g.Alpine = {
      store: () => ({ newSideChannelName: "Notes", }),
      $data: (e: unknown,) => (e === el ? { createSideChannel, } : {}),
    };
    await (g.createSideChannel as () => Promise<void>)();
    expect(createSideChannel,).toHaveBeenCalledTimes(1,);
    expect(createSideChannel,).toHaveBeenCalledWith("Notes",);
  });

  test("toggle/switch globals no-op when Alpine is undefined", async () => {
    stubScope({},);
    delete g.Alpine;
    (g.toggleSideChannels as () => void)();
    await (g.switchSideChannel as (id: string,) => Promise<void>)("s1",);
  });
},);
