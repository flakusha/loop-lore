// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { locationActions, } from "./location-actions";
import type { WorldPageState, } from "./world-types";

// Bare-global apiFetch/showToast pattern (mirrors world-locations.test.ts):
// location-actions.ts has no htmx import, so stub the globals directly.
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
  showToast?: (kind: string, message: string,) => void;
  location?: { assign: (url: string,) => void };
};

// The globals below are owned by every other suite in this worker too, so the
// prior value is captured in `beforeEach` — immediately before we overwrite —
// and handed back verbatim in `afterEach`. Capturing at module scope instead
// would let this file delete a stub another file installed at import time.
let originalApiFetch: typeof g.apiFetch;
let originalShowToast: typeof g.showToast;
let originalLocation: typeof g.location;

let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let toasts: { kind: string; message: string }[] = [];
let assignedUrls: string[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;

const WORLD_ID = "w1";

/** A live-getter view over a slice: prototype chain keeps `this` working.
 * Only DATA fields belong here — stubbing a slice method would shadow the
 * real one and make a test pass without ever exercising it. */
const asState = (slice: object, over: object,): WorldPageState =>
  Object.assign(Object.create(slice,), over,) as WorldPageState;

function ctx(overrides?: object,): WorldPageState {
  return asState(locationActions, {
    worldId: WORLD_ID,
    worldChats: [],
    chatsLoading: false,
    travelBusy: false,
    ...overrides,
  },);
}

/** moveChatTo lives here but refreshes two sibling slices after a success. */
function moveCtx(overrides?: object,): WorldPageState {
  return ctx({
    loadWorldChats: async () => {},
    loadTravelStatus: async () => {},
    ...overrides,
  },);
}

beforeEach(() => {
  originalApiFetch = g.apiFetch;
  originalShowToast = g.showToast;
  originalLocation = g.location;

  fetchCalls = [];
  toasts = [];
  assignedUrls = [];
  fetchHandler = null;

  g.apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts, },);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts ?? {},);
  };

  g.showToast = (kind: string, message: string,) => {
    toasts.push({ kind, message, },);
  };

  g.location = {
    assign: (url: string,) => {
      assignedUrls.push(url,);
    },
  };
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
  g.showToast = originalShowToast;
  g.location = originalLocation;
},);

describe("locationActions.loadWorldChats", () => {
  test("loads the world's chats and clears the loading flag", async () => {
    fetchHandler = () =>
      Response.json({
        data: [
          { id: "c1", name: "Here", current_location_id: "loc1", location_name: "Town", },
          { id: "c2", name: "There", current_location_id: "loc2", location_name: "Cave", },
        ],
      },);

    const c = ctx();
    await c.loadWorldChats();

    expect(c.worldChats.map((ch,) => ch.id),).toEqual(["c1", "c2",],);
    expect(c.worldChats[0]!.location_name,).toBe("Town",);
    expect(c.chatsLoading,).toBe(false,);
    // The list is world-scoped: this page's request must name its own world.
    expect(fetchCalls[0]!.url,).toBe("/api/v1/worlds/w1/chats",);
  });

  test("keeps the previous list when the fetch fails", async () => {
    fetchHandler = () => new Response("nope", { status: 500, },);
    const c = ctx({
      worldChats: [{ id: "keep", name: "Kept", current_location_id: null, location_name: null, },],
    },);

    await c.loadWorldChats();

    expect(c.worldChats.map((ch,) => ch.id),).toEqual(["keep",],);
    expect(c.chatsLoading,).toBe(false,);
  });

  test("keeps the previous list when the network throws", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const c = ctx({
      worldChats: [{ id: "keep", name: "Kept", current_location_id: null, location_name: null, },],
    },);

    await c.loadWorldChats();

    expect(c.worldChats.map((ch,) => ch.id),).toEqual(["keep",],);
    expect(c.chatsLoading,).toBe(false,);
  });

  test("makes no request at all without a world id", async () => {
    const c = ctx({ worldId: null, },);
    await c.loadWorldChats();

    expect(fetchCalls,).toEqual([],);
    expect(c.chatsLoading,).toBe(false,);
  });

  test("treats a non-array data payload as an empty list", async () => {
    fetchHandler = () => Response.json({ data: { nope: true, }, },);
    const c = ctx({
      worldChats: [{ id: "stale", name: "Stale", current_location_id: null, location_name: null, },],
    },);

    await c.loadWorldChats();

    // A malformed payload must clear the list, not leave stale rows on screen.
    expect(c.worldChats,).toEqual([],);
  });
});

describe("locationActions.chatsAt", () => {
  const chats = [
    { id: "c1", name: "Here", current_location_id: "loc1", location_name: null, },
    { id: "c2", name: "There", current_location_id: "loc2", location_name: null, },
    { id: "c3", name: "Unbound", current_location_id: null, location_name: null, },
  ];

  test("returns only the chats bound to that location", () => {
    const c = ctx({ worldChats: chats, },);
    expect(c.chatsAt("loc1",).map((ch,) => ch.id),).toEqual(["c1",],);
  });

  test("null selects the unbound chats", () => {
    const c = ctx({ worldChats: chats, },);
    expect(c.chatsAt(null,).map((ch,) => ch.id),).toEqual(["c3",],);
  });

  test("an unknown location yields nothing rather than everything", () => {
    const c = ctx({ worldChats: chats, },);
    expect(c.chatsAt("loc-not-here",),).toEqual([],);
  });
});

describe("locationActions.moveChatTo", () => {
  test("PUTs the move, toasts success and refreshes both feeds", async () => {
    fetchHandler = () => Response.json({ ok: true, },);

    let chatRefreshes = 0;
    let travelRefreshes = 0;
    const c = moveCtx({
      loadWorldChats: async () => {
        chatRefreshes++;
      },
      loadTravelStatus: async () => {
        travelRefreshes++;
      },
    },);

    await c.moveChatTo("c1", "loc2",);

    const call = fetchCalls[0]!;
    expect(call.url,).toBe("/api/v1/chats/c1/location",);
    expect(call.opts?.method,).toBe("PUT",);
    // The body carries only the destination.
    expect(JSON.parse(String(call.opts?.body,),),).toEqual({ locationId: "loc2", },);
    expect(toasts,).toEqual([{ kind: "success", message: "Chat moved", },],);
    expect(chatRefreshes,).toBe(1,);
    expect(travelRefreshes,).toBe(1,);
    expect(c.travelBusy,).toBe(false,);
  });

  test("surfaces the server error message and does not refresh", async () => {
    fetchHandler = () => Response.json({ error: "Chat belongs to another world", }, { status: 403, },);

    let chatRefreshes = 0;
    const c = moveCtx({
      loadWorldChats: async () => {
        chatRefreshes++;
      },
      loadTravelStatus: async () => {},
    },);

    await c.moveChatTo("c9", "loc2",);

    expect(toasts,).toEqual([{ kind: "error", message: "Chat belongs to another world", },],);
    expect(chatRefreshes,).toBe(0,);
    expect(c.travelBusy,).toBe(false,);
  });

  test("falls back to a generic message when the error body is not JSON", async () => {
    fetchHandler = () => new Response("<html>502</html>", { status: 502, },);
    const c = moveCtx();

    await c.moveChatTo("c1", "loc2",);

    expect(toasts,).toEqual([{ kind: "error", message: "Failed to move chat", },],);
    expect(c.travelBusy,).toBe(false,);
  });

  test("reports a network failure and always clears the busy flag", async () => {
    fetchHandler = () => {
      throw new Error("ECONNRESET",);
    };

    const c = moveCtx();

    await c.moveChatTo("c1", "loc2",);

    expect(toasts,).toEqual([{ kind: "error", message: "Network error", },],);
    expect(c.travelBusy,).toBe(false,);
  });

  test("clears the busy flag even when the post-move refresh throws", async () => {
    fetchHandler = () => Response.json({ ok: true, },);
    const c = moveCtx({
      loadWorldChats: async () => {
        throw new Error("refresh blew up",);
      },
      loadTravelStatus: async () => {},
    },);

    await c.moveChatTo("c1", "loc2",);

    expect(c.travelBusy,).toBe(false,);
  });
});

describe("locationActions.navigateExplore", () => {
  test("routes to the world editor for the current world", () => {
    const c = ctx();
    c.navigateExplore();
    expect(assignedUrls,).toEqual([`/worlds/${WORLD_ID}/edit`,],);
  });

  test("does not borrow another world's id", () => {
    const c = ctx({ worldId: "w-other", },);
    c.navigateExplore();
    expect(assignedUrls,).toEqual(["/worlds/w-other/edit",],);
  });
});
