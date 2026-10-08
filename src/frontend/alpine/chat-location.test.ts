import { afterAll, afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatLocation, } from "./chat-location";
import type { ChatState, } from "./types";

// bun test has no `window`/`dispatchEvent`; override `globalThis.dispatchEvent`
// to a stub that records dispatched events so we can assert on the
// `chat:location-changed` event. chat-location.ts dispatches via
// `globalThis.dispatchEvent`.
const windowEvents: Event[] = [];
const realDispatchEvent = globalThis.dispatchEvent;
(globalThis as { dispatchEvent: (e: Event,) => boolean }).dispatchEvent = (e: Event,) => {
  windowEvents.push(e,);
  return true;
};

afterAll(() => {
  // Restore the real dispatcher: this stub swallows every window event and
  // would leave later files (e.g. shortcuts keynav tests) capturing nothing.
  (globalThis as { dispatchEvent: (e: Event,) => boolean }).dispatchEvent = realDispatchEvent;
},);

// ── Mock apiFetch (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
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

/** */
function mockFetchNetworkError() {
  fetchHandler = () => {
    throw new Error("network",);
  };
}

interface Toast {
  type: string;
  message: string;
}

interface LocationTestContext {
  state: ChatState;
  counters: { loadedChats: number; loadedBackgrounds: number };
}

/**
 * Build a ChatState-like context for the location methods. The real
 * `chatLocation` methods (including private helpers such as
 * `_emitLocationChanged`, which other methods call via `this`) are spread
 * in; data props and mocks override their defaults.
 * @param overrides
 */
function buildCtx(
  overrides: Partial<{
    activeChat: string | null;
    _selectedLocationId: string;
    _chatCurrentLocationId: string | null;
    toasts: Toast[];
  }> = {},
): LocationTestContext {
  const toasts: Toast[] = overrides.toasts ?? [];
  const counters = { loadedChats: 0, loadedBackgrounds: 0, };
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat ?? "chat-1",
    _selectedLocationId: overrides._selectedLocationId ?? "",
    _chatCurrentLocationId: overrides._chatCurrentLocationId ?? null,
    _chatWorldId: "world-1",
    _locations: [
      { id: "loc-1", name: "Tavern", description: null, },
      { id: "loc-2", name: "Forest", description: null, },
    ],
    _locationJoinableChats: [],
    _locationBusy: false,
    toasts,
    loadChats: mock(async () => {
      counters.loadedChats++;
    },),
    loadBackground: mock(async () => {
      counters.loadedBackgrounds++;
    },),
    loadLocationJoinable: mock(async () => {},),
    joinChat: mock(async () => {},),
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };

  const state = { ...chatLocation, ...base, } as unknown as ChatState;
  return { state, counters, };
}

/** Return the captured `chat:location-changed` detail, or null. */
function capturedLocationChanged(): { chatId?: string; locationId?: string; locationName?: string | null } | null {
  const evt = windowEvents.find((e,) => e.type === "chat:location-changed");
  return (evt as CustomEvent<{ chatId?: string; locationId?: string; locationName?: string | null }>)?.detail ?? null;
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  windowEvents.length = 0;
},);

describeOrSkip("chatLocation", () => {
  describeOrSkip("changeChatLocation", () => {
    test("no-ops without a selected location", async () => {
      const { state, } = buildCtx({ _selectedLocationId: "", },);
      await chatLocation.changeChatLocation!.call(state,);
      expect(fetchCalls,).toEqual([],);
    });

    test("PUTs the selected location and emits a change event", async () => {
      mockFetch(200, { ok: true, current_location_id: "loc-2", location_name: "Forest", },);

      const { state, counters, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.changeChatLocation!.call(state,);

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/location",);
      expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ locationId: "loc-2", },);
      expect(state._chatCurrentLocationId,).toBe("loc-2",);

      // Emits a location-changed event the VN renderer can consume.
      const detail = capturedLocationChanged();
      expect(detail?.chatId,).toBe("chat-1",);
      expect(detail?.locationId,).toBe("loc-2",);

      // Refreshes the chat list + background after the location change.
      expect(counters.loadedChats,).toBe(1,);
      expect(counters.loadedBackgrounds,).toBe(1,);
    });

    test("shows a toast and does not call the endpoint when already there", async () => {
      mockFetch(200,);
      const toasts: Toast[] = [];
      const { state, } = buildCtx({ _selectedLocationId: "loc-1", _chatCurrentLocationId: "loc-1", toasts, },);
      await chatLocation.changeChatLocation!.call(state,);
      expect(fetchCalls,).toEqual([],);
      expect(toasts[0]?.type,).toBe("info",);
    });

    test("shows an error toast on non-OK response", async () => {
      mockFetch(400, { message: "not found", },);
      const toasts: Toast[] = [];
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", toasts, },);
      await chatLocation.changeChatLocation!.call(state,);
      expect(toasts[0]?.type,).toBe("error",);
      expect(state._chatCurrentLocationId,).toBeNull();
    });

    test("handles network failure gracefully", async () => {
      mockFetchNetworkError();
      const toasts: Toast[] = [];
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", toasts, },);
      await chatLocation.changeChatLocation!.call(state,);
      expect(toasts[0]?.type,).toBe("error",);
    });
  },);

  describeOrSkip("transferChatLocation", () => {
    test("POSTs to /api/v1/chats/:id/transfer and updates location", async () => {
      mockFetch(200, { ok: true, locationId: "loc-2", },);
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.transferChatLocation!.call(state,);
      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/transfer",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ locationId: "loc-2", },);
      expect(state._chatCurrentLocationId,).toBe("loc-2",);
    });
  },);

  describeOrSkip("loadLocationJoinable", () => {
    test("queries joinable chats filtered by the selected location", async () => {
      mockFetch(200, {
        data: [
          { chatId: "c1", chatName: "Adventurers", participantCount: 3, lastActiveAt: "2026-01-01", },
        ],
      },);

      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.loadLocationJoinable!.call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/joinable?location=loc-2",);
      expect(state._locationJoinableChats,).toEqual([
        { chatId: "c1", chatName: "Adventurers", participantCount: 3, lastActiveAt: "2026-01-01", },
      ],);
    });

    test("clears the list when no location is selected", async () => {
      const { state, } = buildCtx({ _selectedLocationId: "", },);
      await chatLocation.loadLocationJoinable!.call(state,);
      expect(fetchCalls,).toEqual([],);
      expect(state._locationJoinableChats,).toEqual([],);
    });
  },);

  describeOrSkip("joinLocationChat", () => {
    test("joins and refreshes the location-scoped list", async () => {
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.joinLocationChat!.call(state, "c1",);

      expect(state.joinChat,).toHaveBeenCalledWith("c1",);

      expect(state.loadLocationJoinable,).toHaveBeenCalled();
    });
  },);
},);

describeOrSkip("chatLocation — toggleLocationPanel", () => {
  test("opens the panel and loads locations", async () => {
    mockFetch(200, { data: { locations: [{ id: "loc-9", name: "Cave", description: null, },], }, },);
    const { state, } = buildCtx();
    state._locationOpen = false;
    await chatLocation.toggleLocationPanel!.call(state,);
    // toggleLocationPanel fires loadLocations without awaiting it — let it settle
    await new Promise<void>((resolve,) => setTimeout(resolve, 10,));
    expect(state._locationOpen,).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
    expect(state._locations.map((l,) => l.id),).toEqual(["loc-9",],);
  });

  test("closes the panel without loading", async () => {
    const { state, } = buildCtx();
    state._locationOpen = true;
    await chatLocation.toggleLocationPanel!.call(state,);
    expect(state._locationOpen,).toBe(false,);
    expect(fetchCalls,).toEqual([],);
  });
},);

describeOrSkip("chatLocation — _scheduleRecentLocationFlagReset", () => {
  test("cancels a pending reset when called again rapidly", () => {
    const { state, } = buildCtx();
    state._chatRecentLocationChanged = true;
    chatLocation._scheduleRecentLocationFlagReset!.call(state,);
    const first = state._locationFlagTimer;
    chatLocation._scheduleRecentLocationFlagReset!.call(state,);
    expect(state._locationFlagTimer,).not.toBe(first,);
    expect(state._chatRecentLocationChanged,).toBe(true,);
    globalThis.clearTimeout(state._locationFlagTimer!,);
  });

  test("clears the recent-changed flag after the delay", async () => {
    const { state, } = buildCtx();
    state._chatRecentLocationChanged = true;
    chatLocation._scheduleRecentLocationFlagReset!.call(state,);
    await new Promise<void>((resolve,) => setTimeout(resolve, 2600,));
    expect(state._chatRecentLocationChanged,).toBe(false,);
    expect(state._locationFlagTimer,).toBeNull();
  });
},);

describeOrSkip("chatLocation — loadLocations", () => {
  test("no-ops without an active chat", async () => {
    // buildCtx's `??` turns an explicit null override into the default — set it directly
    const { state, } = buildCtx();
    state.activeChat = null;
    await chatLocation.loadLocations!.call(state,);
    expect(fetchCalls,).toEqual([],);
    expect(state._locationsLoading,).toBe(false,);
  });

  test("populates locations and preselects the current one", async () => {
    mockFetch(200, {
      data: {
        locations: [{ id: "loc-1", name: "Tavern", description: null, }, {
          id: "loc-2",
          name: "Forest",
          description: null,
        },],
      },
    },);

    const { state, } = buildCtx({ _chatCurrentLocationId: "loc-2", },);
    state._selectedLocationId = "";
    await chatLocation.loadLocations!.call(state,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/world-1/location-explorer",);
    expect(state._locations,).toHaveLength(2,);
    expect(state._selectedLocationId,).toBe("loc-2",);
    expect(state._locationsLoading,).toBe(false,);
  });

  test("falls back to the first location when the chat has no current location", async () => {
    mockFetch(200, { data: { locations: [{ id: "loc-1", name: "Tavern", description: null, },], }, },);
    const { state, } = buildCtx();
    state._selectedLocationId = "";
    await chatLocation.loadLocations!.call(state,);
    expect(state._selectedLocationId,).toBe("loc-1",);
  });

  test("empties the list when the world id cannot be resolved", async () => {
    const { state, } = buildCtx();
    state._chatWorldId = null;
    mockFetch(200, { id: "chat-1", },);
    await chatLocation.loadLocations!.call(state,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1",);
    expect(state._locations,).toEqual([],);
  });

  test("empties the list on a non-ok response", async () => {
    mockFetch(500, {},);
    const { state, } = buildCtx();
    await chatLocation.loadLocations!.call(state,);
    expect(state._locations,).toEqual([],);
    expect(state._locationsLoading,).toBe(false,);
  });

  test("empties the list on a network error", async () => {
    mockFetchNetworkError();
    const { state, } = buildCtx();
    await chatLocation.loadLocations!.call(state,);
    expect(state._locations,).toEqual([],);
    expect(state._locationsLoading,).toBe(false,);
  });
},);

describeOrSkip("chatLocation — _locationWorldId", () => {
  test("returns the cached world id without fetching", async () => {
    const { state, } = buildCtx();
    const worldId = await chatLocation._locationWorldId!.call(state,);
    expect(worldId,).toBe("world-1",);
    expect(fetchCalls,).toEqual([],);
  });

  test("falls back to the chat detail endpoint", async () => {
    const { state, } = buildCtx();
    state._chatWorldId = null;
    let call = 0;
    fetchHandler = (_url, _opts,) => {
      call++;
      if (call === 1) {
        return Response.json({ id: "chat-1", world_id: "world-9", current_location_id: "loc-7", }, { status: 200, },);
      }

      return Response.json({ data: { locations: [], }, }, { status: 200, },);
    };

    const worldId = await chatLocation._locationWorldId!.call(state,);
    expect(worldId,).toBe("world-9",);
    expect(state._chatCurrentLocationId,).toBe("loc-7",);
  });

  test("returns null when the chat fetch fails", async () => {
    const { state, } = buildCtx();
    state._chatWorldId = null;
    mockFetch(500, {},);
    expect(await chatLocation._locationWorldId!.call(state,),).toBeNull();
  });
},);

describeOrSkip("chatLocation — name getters", () => {
  test("resolves selected and current location names", () => {
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", _chatCurrentLocationId: "loc-1", },);
    // buildCtx's spread snapshots getters at copy time — invoke them against the test state
    const selectedName = Object.getOwnPropertyDescriptor(chatLocation, "selectedLocationName",)!.get!.call(state,);
    const currentName = Object.getOwnPropertyDescriptor(chatLocation, "currentLocationName",)!.get!.call(state,);
    expect(selectedName,).toBe("Forest",);
    expect(currentName,).toBe("Tavern",);
  });

  test("returns null for unknown location ids", () => {
    const { state, } = buildCtx({ _selectedLocationId: "nope", },);
    const selectedName = Object.getOwnPropertyDescriptor(chatLocation, "selectedLocationName",)!.get!.call(state,);
    const currentName = Object.getOwnPropertyDescriptor(chatLocation, "currentLocationName",)!.get!.call(state,);
    expect(selectedName,).toBeNull();
    expect(currentName,).toBeNull();
  });
},);

describeOrSkip("chatLocation — changeChatLocation guards", () => {
  test("no-ops without an active chat", async () => {
    // buildCtx's `??` turns an explicit null override into the default — set it directly
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
    state.activeChat = null;
    await chatLocation.changeChatLocation!.call(state,);
    expect(fetchCalls,).toEqual([],);
  });

  test("no-ops while a change is already in flight", async () => {
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
    state._locationBusy = true;
    await chatLocation.changeChatLocation!.call(state,);
    expect(fetchCalls,).toEqual([],);
  });

  test("toasts an error when the post-change reload fails", async () => {
    mockFetch(200, { ok: true, },);
    const toasts: Toast[] = [];
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", toasts, },);
    state.loadChats = mock(async () => {
      throw new Error("reload failed",);
    },);

    await chatLocation.changeChatLocation!.call(state,);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(state._locationBusy,).toBe(false,);
  });
},);

describeOrSkip("chatLocation — transferChatLocation error paths", () => {
  test("no-ops without a selected location", async () => {
    const { state, } = buildCtx({ _selectedLocationId: "", },);
    await chatLocation.transferChatLocation!.call(state,);
    expect(fetchCalls,).toEqual([],);
  });

  test("toasts an error on a non-ok response", async () => {
    mockFetch(403, { error: "forbidden", },);
    const toasts: Toast[] = [];
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", toasts, },);
    await chatLocation.transferChatLocation!.call(state,);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(state._chatCurrentLocationId,).toBeNull();
    expect(state._locationBusy,).toBe(false,);
  });

  test("toasts an error on a network failure", async () => {
    mockFetchNetworkError();
    const toasts: Toast[] = [];
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", toasts, },);
    await chatLocation.transferChatLocation!.call(state,);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(state._locationBusy,).toBe(false,);
  });
},);

describeOrSkip("chatLocation — loadLocationJoinable error paths", () => {
  test("clears the list on a non-ok response", async () => {
    mockFetch(500, {},);
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
    state._locationJoinableChats = [{ chatId: "stale", chatName: "S", participantCount: 1, lastActiveAt: null, },];
    await chatLocation.loadLocationJoinable!.call(state,);
    expect(state._locationJoinableChats,).toEqual([],);
  });

  test("clears the list on a network error", async () => {
    mockFetchNetworkError();
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
    state._locationJoinableChats = [{ chatId: "stale", chatName: "S", participantCount: 1, lastActiveAt: null, },];
    await chatLocation.loadLocationJoinable!.call(state,);
    expect(state._locationJoinableChats,).toEqual([],);
  });

  test("tolerates a bare array body and applies field defaults", async () => {
    mockFetch(200, [{ chatId: "c1", chatName: "Adventurers", },],);
    const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
    await chatLocation.loadLocationJoinable!.call(state,);
    expect(state._locationJoinableChats,).toEqual([
      { chatId: "c1", chatName: "Adventurers", participantCount: 0, lastActiveAt: null, },
    ],);
  });
},);
