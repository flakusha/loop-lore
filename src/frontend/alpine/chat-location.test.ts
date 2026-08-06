import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatLocation, } from "./chat-location";
import type { ChatState, } from "./types";

// bun test has no `window`/`dispatchEvent`; override `globalThis.dispatchEvent`
// to a stub that records dispatched events so we can assert on the
// `chat:location-changed` event. chat-location.ts dispatches via
// `globalThis.dispatchEvent`.
const windowEvents: Event[] = [];
(globalThis as { dispatchEvent: (e: Event) => boolean }).dispatchEvent = (e: Event) => {
  windowEvents.push(e,);
  return true;
};

// ── Mock apiFetch (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

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

describe("chatLocation", () => {
  describe("changeChatLocation", () => {
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
      expect(fetchCalls[0]?.url,).toBe("/api/chats/chat-1/location",);
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
  });

  describe("transferChatLocation", () => {
    test("POSTs to /api/chats/:id/transfer and updates location", async () => {
      mockFetch(200, { ok: true, locationId: "loc-2", },);
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.transferChatLocation!.call(state,);
      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/chats/chat-1/transfer",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ locationId: "loc-2", },);
      expect(state._chatCurrentLocationId,).toBe("loc-2",);
    });
  });

  describe("loadLocationJoinable", () => {
    test("queries joinable chats filtered by the selected location", async () => {
      mockFetch(200, {
        data: [
          { chatId: "c1", chatName: "Adventurers", participantCount: 3, lastActiveAt: "2026-01-01", },
        ],
      },);
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.loadLocationJoinable!.call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/chats/joinable?location=loc-2",);
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
  });

  describe("joinLocationChat", () => {
    test("joins and refreshes the location-scoped list", async () => {
      const { state, } = buildCtx({ _selectedLocationId: "loc-2", },);
      await chatLocation.joinLocationChat!.call(state, "c1",);
      expect(state.joinChat,).toHaveBeenCalledWith("c1",);
      expect(state.loadLocationJoinable,).toHaveBeenCalled();
    });
  });
});
