import { describe, expect, mock, test, } from "bun:test";
import { chatFilters, } from "./chat-filters";

/** Minimal localStorage stub (bun test env has none); passes the fake to `run` and restores the global after. */
function withFakeStorage(run: (store: Storage,) => void,): void {
  const g = globalThis as Record<string, unknown>;
  const original = g.localStorage;
  const backing = new Map<string, string>();
  const fake: Storage = {
    getItem: (k: string,) => backing.get(k,) ?? null,
    setItem: (k: string, v: string,) => void backing.set(k, v,),
    removeItem: (k: string,) => void backing.delete(k,),
  } as Storage;

  g.localStorage = fake;
  try {
    run(fake,);
  } finally {
    g.localStorage = original;
  }
}

describe("chatFilters", () => {
  describe("_filterParams", () => {
    test("defaults to pageSize only when no filters active", () => {
      const ctx = { _chatType: "all", _chatStatus: "all", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toBe("pageSize=200",);
    });

    test("emits type when not 'all'", () => {
      const ctx = { _chatType: "group", _chatStatus: "all", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("type=group",);
    });

    test("maps _chatStatus active -> archived=false", () => {
      const ctx = { _chatType: "all", _chatStatus: "active", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("archived=false",);
    });

    test("maps _chatStatus archived -> archived=true", () => {
      const ctx = { _chatType: "all", _chatStatus: "archived", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("archived=true",);
    });

    test("emits sort when not 'recent'", () => {
      const ctx = { _chatType: "all", _chatStatus: "all", _chatSort: "pinned-first", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("sort=pinned-first",);
    });

    test("omits 'all' status entirely", () => {
      const ctx = { _chatType: "direct", _chatStatus: "all", _chatSort: "name", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("type=direct",);
      expect(params,).toContain("sort=name",);
      expect(params,).not.toContain("archived",);
    });
  });

  describe("applyChatFilters", () => {
    test("clears search results and reloads the chat list", async () => {
      let reloaded = 0;
      const ctx = {
        _searchResults: [{ chatId: "c1", chatName: "n", characterName: "cn", characterAvatar: null, },],
        persistChatFilters: chatFilters.persistChatFilters,
        loadChats: mock(async () => {
          reloaded++;
        },),
      };

      await chatFilters.applyChatFilters!.call(ctx,);
      expect(ctx._searchResults,).toEqual([],);
      expect(reloaded,).toBe(1,);
    });
  });

  describe("persistChatFilters / restoreChatFilters", () => {
    const KEY = "chat-sidebar-filters";

    test("persists active filters and omits defaults", () => {
      withFakeStorage((store,) => {
        const ctx = {
          _chatType: "group",
          _chatStatus: "all",
          _chatSort: "recent",
          _chatWorld: "",
          _chatMinMessages: "5",
          _chatMaxMessages: "",
          _chatUpdatedSince: "",
        };

        chatFilters.persistChatFilters!.call(ctx,);
        const raw = store.getItem(KEY,);
        expect(raw,).not.toBeNull();
        expect(JSON.parse(raw as string,),).toEqual({ type: "group", minMessages: "5", },);
      },);
    });

    test("restore hydrates fields and ignores invalid values", () => {
      withFakeStorage((store,) => {
        store.setItem(
          KEY,
          JSON.stringify({
            type: "direct",
            status: "archived",
            sort: "nope",
            world: "w1",
            minMessages: "3",
            updatedSince: "2026-08-01",
          },),
        );

        const ctx = {
          _chatType: "all",
          _chatStatus: "all",
          _chatSort: "recent",
          _chatWorld: "",
          _chatMinMessages: "",
          _chatMaxMessages: "",
          _chatUpdatedSince: "",
        };

        chatFilters.restoreChatFilters!.call(ctx,);
        expect(ctx._chatType,).toBe("direct",);
        expect(ctx._chatStatus,).toBe("archived",);
        expect(ctx._chatSort,).toBe("recent",);
        expect(ctx._chatWorld,).toBe("w1",);
        expect(ctx._chatMinMessages,).toBe("3",);
        expect(ctx._chatUpdatedSince,).toBe("2026-08-01",);
      },);
    });

    test("restore survives corrupt storage", () => {
      withFakeStorage((store,) => {
        store.setItem(KEY, "{not json",);
        const ctx = {
          _chatType: "all",
          _chatStatus: "all",
          _chatSort: "recent",
          _chatWorld: "",
          _chatMinMessages: "",
          _chatMaxMessages: "",
          _chatUpdatedSince: "",
        };

        expect(() => chatFilters.restoreChatFilters!.call(ctx,)).not.toThrow();
        expect(ctx._chatType,).toBe("all",);
      },);
    });
  });

  describe("activeChatFilterChips / clearChatFilter / clearAllChatFilters", () => {
    test("chips list only active filters; world resolves to its display name", () => {
      const ctx = {
        _chatType: "group",
        _chatStatus: "all",
        _chatSort: "recent",
        _chatWorld: "w1",
        _chatMinMessages: "",
        _chatMaxMessages: "",
        _chatUpdatedSince: "",
        _worlds: [{ id: "w1", name: "Everhollow", },],
      };

      const chips = chatFilters.activeChatFilterChips!.call(ctx,);
      expect(chips,).toEqual([
        { key: "type", label: "group", },
        { key: "world", label: "Everhollow", },
      ],);
    });

    test("clearChatFilter resets one filter and reloads", () => {
      withFakeStorage(() => {
        const ctx = {
          _chatType: "group",
          _chatStatus: "all",
          _chatSort: "recent",
          _chatWorld: "",
          _chatMinMessages: "",
          _chatMaxMessages: "",
          _chatUpdatedSince: "",
          _searchResults: [] as unknown[],
          persistChatFilters: chatFilters.persistChatFilters,
          applyChatFilters: chatFilters.applyChatFilters,
          loadChats: mock(async () => {},),
        };

        void chatFilters.clearChatFilter!.call(ctx, "type",);
        expect(ctx._chatType,).toBe("all",);
        expect(ctx.loadChats,).toHaveBeenCalledTimes(1,);
      },);
    });

    test("clearAllChatFilters resets every filter and reloads", () => {
      withFakeStorage(() => {
        const ctx = {
          _chatType: "group",
          _chatStatus: "archived",
          _chatSort: "name",
          _chatWorld: "w1",
          _chatMinMessages: "2",
          _chatMaxMessages: "9",
          _chatUpdatedSince: "2026-08-01",
          _searchResults: [] as unknown[],
          persistChatFilters: chatFilters.persistChatFilters,
          applyChatFilters: chatFilters.applyChatFilters,
          loadChats: mock(async () => {},),
        };

        void chatFilters.clearAllChatFilters!.call(ctx,);
        expect(ctx._chatType,).toBe("all",);
        expect(ctx._chatStatus,).toBe("all",);
        expect(ctx._chatSort,).toBe("recent",);
        expect(ctx._chatWorld,).toBe("",);
        expect(ctx._chatMinMessages,).toBe("",);
        expect(ctx._chatMaxMessages,).toBe("",);
        expect(ctx._chatUpdatedSince,).toBe("",);
        expect(ctx.loadChats,).toHaveBeenCalledTimes(1,);
        expect(chatFilters.activeChatFilterChips!.call(ctx,),).toEqual([],);
      },);
    });
  });
});

/** Swap globalThis.localStorage for the duration of `run`. */
function withLocalStorage(value: unknown, run: () => void,): void {
  const g = globalThis as Record<string, unknown>;
  const original = g.localStorage;
  Object.defineProperty(g, "localStorage", { configurable: true, writable: true, value, },);
  try {
    run();
  } finally {
    Object.defineProperty(g, "localStorage", { configurable: true, writable: true, value: original, },);
  }
}

describe("chatFilters — edge cases", () => {
  const KEY = "chat-sidebar-filters";
  const defaults = {
    _chatType: "all",
    _chatStatus: "all",
    _chatSort: "recent",
    _chatWorld: "",
    _chatMinMessages: "",
    _chatMaxMessages: "",
    _chatUpdatedSince: "",
  };

  test("_filterParams omits an empty-string type", () => {
    const params = chatFilters._filterParams!.call({ ...defaults, _chatType: "", },);
    expect(params,).toBe("pageSize=200",);
  });

  test("_filterParams emits world, message bounds, and updated-since", () => {
    const params = chatFilters._filterParams!.call({
      ...defaults,
      _chatWorld: "w1",
      _chatMinMessages: "2",
      _chatMaxMessages: "9",
      _chatUpdatedSince: "2026-08-01",
    },);

    expect(params,).toContain("world=w1",);
    expect(params,).toContain("minMessages=2",);
    expect(params,).toContain("maxMessages=9",);
    expect(params,).toContain("updatedSince=2026-08-01",);
  });

  test("persist writes every non-default filter", () => {
    withFakeStorage((store,) => {
      chatFilters.persistChatFilters!.call({
        ...defaults,
        _chatType: "direct",
        _chatStatus: "archived",
        _chatSort: "unread",
        _chatWorld: "w1",
        _chatMinMessages: "2",
        _chatMaxMessages: "9",
        _chatUpdatedSince: "2026-08-01",
      },);

      expect(JSON.parse(store.getItem(KEY,) as string,),).toEqual({
        type: "direct",
        status: "archived",
        sort: "unread",
        world: "w1",
        minMessages: "2",
        maxMessages: "9",
        updatedSince: "2026-08-01",
      },);
    },);
  });

  test("persist is a no-op when localStorage is undefined", () => {
    withLocalStorage(undefined, () => {
      expect(() => chatFilters.persistChatFilters!.call({ ...defaults, _chatType: "group", },)).not.toThrow();
    },);
  });

  test("persist survives setItem throwing", () => {
    withLocalStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded",);
      },
      removeItem: () => {},
    } as unknown as Storage, () => {
      expect(() => chatFilters.persistChatFilters!.call({ ...defaults, _chatType: "group", },)).not.toThrow();
    },);
  });

  test("restore with no stored blob leaves defaults untouched", () => {
    withFakeStorage(() => {
      const ctx = { ...defaults, };
      chatFilters.restoreChatFilters!.call(ctx,);
      expect(ctx,).toEqual(defaults,);
    },);
  });

  test("restore ignores a JSON array blob", () => {
    withFakeStorage((store,) => {
      store.setItem(KEY, "[]",);
      const ctx = { ...defaults, };
      chatFilters.restoreChatFilters!.call(ctx,);
      expect(ctx,).toEqual(defaults,);
    },);
  });

  test("restore ignores a JSON null blob", () => {
    withFakeStorage((store,) => {
      store.setItem(KEY, "null",);
      const ctx = { ...defaults, };
      chatFilters.restoreChatFilters!.call(ctx,);
      expect(ctx,).toEqual(defaults,);
    },);
  });

  test("restore survives localStorage access throwing", () => {
    withLocalStorage(undefined, () => {
      const g = globalThis as Record<string, unknown>;
      Object.defineProperty(g, "localStorage", {
        configurable: true,
        get() {
          throw new Error("denied",);
        },
      },);

      const ctx = { ...defaults, };
      expect(() => chatFilters.restoreChatFilters!.call(ctx,)).not.toThrow();
      expect(ctx,).toEqual(defaults,);
    },);
  });

  test("restore hydrates group type, active status, unread sort, and maxMessages", () => {
    withFakeStorage((store,) => {
      store.setItem(
        KEY,
        JSON.stringify({
          type: "group",
          status: "active",
          sort: "unread",
          maxMessages: "9",
        },),
      );

      const ctx = { ...defaults, };
      chatFilters.restoreChatFilters!.call(ctx,);
      expect(ctx._chatType,).toBe("group",);
      expect(ctx._chatStatus,).toBe("active",);
      expect(ctx._chatSort,).toBe("unread",);
      expect(ctx._chatMaxMessages,).toBe("9",);
    },);
  });

  test("chips render message-count and date filters with units", () => {
    const chips = chatFilters.activeChatFilterChips!.call({
      ...defaults,
      _chatMinMessages: "5",
      _chatMaxMessages: "10",
      _chatUpdatedSince: "2026-08-01",
    },);

    expect(chips,).toEqual([
      { key: "minMessages", label: "≥ 5 msgs", },
      { key: "maxMessages", label: "≤ 10 msgs", },
      { key: "updatedSince", label: "since 2026-08-01", },
    ],);
  });

  test("world chip falls back to the raw id when no world matches", () => {
    const chips = chatFilters.activeChatFilterChips!.call({
      ...defaults,
      _chatWorld: "missing",
      _worlds: [{ id: "w1", name: "Everhollow", },],
    },);

    expect(chips,).toEqual([{ key: "world", label: "missing", },],);
  });

  test("clearChatFilter resets each remaining filter key and reloads", async () => {
    const ctx = {
      ...defaults,
      _chatStatus: "archived",
      _chatSort: "name",
      _chatWorld: "w1",
      _chatMinMessages: "2",
      _chatMaxMessages: "9",
      _chatUpdatedSince: "2026-08-01",
      _searchResults: [] as unknown[],
      persistChatFilters: chatFilters.persistChatFilters,
      applyChatFilters: chatFilters.applyChatFilters,
      loadChats: mock(async () => {},),
    };

    const pending: Promise<void>[] = [];
    withFakeStorage(() => {
      // The switch resets each field synchronously; only the reload is async.
      for (const key of ["status", "sort", "world", "minMessages", "maxMessages", "updatedSince",] as const) {
        pending.push(chatFilters.clearChatFilter!.call(ctx, key,),);
      }
    },);

    await Promise.all(pending,);
    expect(ctx._chatStatus,).toBe("all",);
    expect(ctx._chatSort,).toBe("recent",);
    expect(ctx._chatWorld,).toBe("",);
    expect(ctx._chatMinMessages,).toBe("",);
    expect(ctx._chatMaxMessages,).toBe("",);
    expect(ctx._chatUpdatedSince,).toBe("",);
    expect(ctx.loadChats,).toHaveBeenCalledTimes(6,);
  });
});
