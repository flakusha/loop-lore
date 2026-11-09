import "./i18n.test-helper";
import { afterEach, describe, expect, test, } from "bun:test";
import { npcMovementMethods, } from "./npc-movement";
import type { ChatState, MovementEvent, } from "./types";

// ── Mock global apiFetch (npc-movement uses bare `apiFetch` = globalThis.apiFetch) ──
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

const mockEvent = (timestamp: string,): MovementEvent => ({
  actorId: "actor-1",
  fromLocationId: "",
  toLocationId: "the tavern",
  pattern: "regex",
  timestamp,
});

/** Test state whose `movementEvents` is always defined (narrowed from Partial<ChatState>). */
type MovementState = Partial<ChatState> & { movementEvents: MovementEvent[] };

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describe("npcMovementMethods", () => {
  describe("loadMovementEvents", () => {
    test("fetches recent events for the active chat and keeps the last 8", async () => {
      const events = Array.from(
        { length: 12, },
        (_v, i,) => mockEvent(`2026-01-01T00:00:${String(i,).padStart(2, "0",)}Z`,),
      );

      mockFetch(200, events,);
      const state: MovementState = { activeChat: "chat-1", movementEvents: [], };

      await npcMovementMethods.loadMovementEvents!.call(state,);

      expect(fetchCalls[0]?.url,).toBe("/api/v1/npc-movement/recent/chat-1",);
      expect(state.movementEvents,).toHaveLength(8,);
      // Newest at the end: the slice keeps the LAST events.
      expect(state.movementEvents[0]!.timestamp,).toBe("2026-01-01T00:00:04Z",);
      expect(state.movementEvents[7]!.timestamp,).toBe("2026-01-01T00:00:11Z",);
    });

    test("skips the fetch when no chat is active", async () => {
      const state: MovementState = { activeChat: null, movementEvents: [], };

      await npcMovementMethods.loadMovementEvents!.call(state,);

      expect(fetchCalls,).toHaveLength(0,);
    });

    test("stores an empty list on a non-ok response and resets the loading flag", async () => {
      mockFetch(500,);
      const state: MovementState = { activeChat: "chat-1", movementEvents: [], };

      await npcMovementMethods.loadMovementEvents!.call(state,);

      expect(state.movementEvents,).toEqual([],);
      expect(state.loadingMovementEvents,).toBe(false,);
    });

    test("stores an empty list on a malformed (non-array) body", async () => {
      mockFetch(200, { unexpected: "shape", },);
      const state: MovementState = { activeChat: "chat-1", movementEvents: [], };

      await npcMovementMethods.loadMovementEvents!.call(state,);

      expect(state.movementEvents,).toEqual([],);
    });
  });

  describe("npcMovementActorName", () => {
    test("resolves participant display names and falls back to a truncated id", () => {
      const state = {
        _participants: [
          { actor_id: "actor-1", display_name: "Mirra", },
          { actor_id: "actor-2", display_name: "", },
        ],
      } as unknown as Partial<ChatState>;

      expect(npcMovementMethods.npcMovementActorName!.call(state, "actor-1",),).toBe("Mirra",);
      // Blank display_name falls through to the truncated id.
      expect(npcMovementMethods.npcMovementActorName!.call(state, "actor-2",),).toBe("actor-2",);
      expect(npcMovementMethods.npcMovementActorName!.call(state, "actor-unknown-1",),).toBe("actor-un",);
    });
  });

  describe("getMovementIcon", () => {
    test("maps classification sources to icons", () => {
      expect(npcMovementMethods.getMovementIcon!("regex",),).toBe("👣",);
      expect(npcMovementMethods.getMovementIcon!("aux-llm",),).toBe("🧭",);
      expect(npcMovementMethods.getMovementIcon!("none",),).toBe("📍",);
    });
  });
});
