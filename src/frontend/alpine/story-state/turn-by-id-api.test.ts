import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import {
  clearStoryTurnCache,
  fetchStoryTurnById,
  storyTurnCacheSize,
} from "./turn-by-id-api";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
let fetchCalls: string[] = [];
let fetchHandler: ((url: string,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string,) => {
      fetchCalls.push(url,);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url,);
    },
  }),);
}

const TURN = {
  id: "turn-1",
  chat_id: "chat-1",
  turn_number: 3,
  parent_message_id: null,
  actor_id: "actor-1",
  prompt_sent: "The goblin attacks",
  quality_score: 82,
  status: "complete",
  quest_progress: "",
};

describeOrSkip("fetchStoryTurnById", () => {
  afterEach(() => {
    clearStoryTurnCache();
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("fetches and returns the turn", async () => {
    fetchHandler = () => Response.json(TURN,);
    const turn = await fetchStoryTurnById("chat-1", "turn-1",);
    expect(turn?.id,).toBe("turn-1",);
    expect(fetchCalls,).toEqual(["/api/v1/chats/chat-1/story-turns/turn-1",],);
  });

  test("serves repeats from the per (chatId, turnId) cache", async () => {
    fetchHandler = () => Response.json(TURN,);
    await fetchStoryTurnById("chat-1", "turn-1",);
    await fetchStoryTurnById("chat-1", "turn-1",);
    expect(fetchCalls.length,).toBe(1,);
    expect(storyTurnCacheSize(),).toBe(1,);
  });

  test("does not share cache entries across chats", async () => {
    fetchHandler = () => Response.json(TURN,);
    await fetchStoryTurnById("chat-1", "turn-1",);
    await fetchStoryTurnById("chat-2", "turn-1",);
    expect(fetchCalls.length,).toBe(2,);
    expect(storyTurnCacheSize(),).toBe(2,);
  });

  test("returns null on non-ok without caching", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    expect(await fetchStoryTurnById("chat-1", "turn-x",),).toBeNull();
    expect(storyTurnCacheSize(),).toBe(0,);
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    expect(await fetchStoryTurnById("chat-1", "turn-x",),).toBeNull();
  });
},);
