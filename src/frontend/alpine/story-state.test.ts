import { afterEach, describe, expect, mock, test, } from "bun:test";
import "./story-state";
import type { StoryStateComponent, } from "./story-state";

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

function mockFetch(status: number, body: unknown,): void {
  fetchHandler = () => Response.json(body, { status, },);
}

function makeState(): StoryStateComponent {
  return (globalThis as unknown as Record<string, () => StoryStateComponent>).storyState!();
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  (globalThis as { Alpine?: unknown }).Alpine = undefined;
},);

describe("storyState", () => {
  describe("derived state", () => {
    test("qualityClass tiers: good ≥70, mid ≥40, low below", () => {
      const s = makeState();
      expect(s.qualityClass(85,),).toBe("is-good",);
      expect(s.qualityClass(70,),).toBe("is-good",);
      expect(s.qualityClass(55,),).toBe("is-mid",);
      expect(s.qualityClass(40,),).toBe("is-mid",);
      expect(s.qualityClass(12,),).toBe("is-low",);
    });

    test("questProgressPct clamps to 0..100", () => {
      const s = makeState();
      expect(s.questProgressPct({ progress: 50, } as never,),).toBe(50,);
      expect(s.questProgressPct({ progress: -5, } as never,),).toBe(0,);
      expect(s.questProgressPct({ progress: 120, } as never,),).toBe(100,);
      expect(s.questProgressPct({ progress: 49.6, } as never,),).toBe(50,);
    });

    test("turnForMessage looks up by parent message id, null when absent", () => {
      const s = makeState();
      s.turnMeta["msg-1"] = { turnNumber: 3, qualityScore: 88, promptSent: "go", status: "completed", };
      expect(s.turnForMessage("msg-1",),).toEqual({
        turnNumber: 3,
        qualityScore: 88,
        promptSent: "go",
        status: "completed",
      },);
      expect(s.turnForMessage("nope",),).toBeNull();
    });
  });

  describe("_parseQuestBanners", () => {
    test("parses quest_name/progress entries (progress is 0-100)", () => {
      const s = makeState();
      const banners = s._parseQuestBanners(JSON.stringify([
        { quest_name: "Slay the dragon", progress: 50, },
        { questName: "Find the relic", progress: 100, },
      ],),);
      expect(banners,).toEqual([
        { questName: "Slay the dragon", progress: 50, },
        { questName: "Find the relic", progress: 100, },
      ],);
    });

    test("skips entries without numeric progress; tolerates garbage", () => {
      const s = makeState();
      expect(s._parseQuestBanners(JSON.stringify([{ quest_name: "x", },],),),).toEqual([],);
      expect(s._parseQuestBanners("not json",),).toEqual([],);
    });
  });

  describe("_loadChat", () => {
    test("detects story mode from mode field and loads world name", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(200, { mode: "story", world_id: "world-1", gm_config: null, },);
      await s._loadChat();
      expect(s.isStoryMode,).toBe(true,);
      // Second fetch: world name.
      expect(fetchCalls[1]?.url,).toBe("/api/worlds/world-1",);
    });

    test("detects story mode from gm_config.storyMode", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(200, { mode: "direct", world_id: null, gm_config: JSON.stringify({ storyMode: true, },), },);
      await s._loadChat();
      expect(s.isStoryMode,).toBe(true,);
    });

    test("stays non-story when neither signal is present", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(200, { mode: "direct", world_id: null, gm_config: "{}", },);
      await s._loadChat();
      expect(s.isStoryMode,).toBe(false,);
    });

    test("keeps isStoryMode false when the chat fetch fails", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(500, {},);
      await s._loadChat();
      expect(s.isStoryMode,).toBe(false,);
    });
  });

  describe("_loadTurns", () => {
    test("indexes turns by parent message id and derives latest-turn state", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(200, {
        data: [
          {
            id: "t1",
            turn_number: 1,
            parent_message_id: "msg-1",
            actor_id: "a1",
            prompt_sent: "GM: enter the cave",
            quality_score: 92,
            status: "completed",
            quest_progress: "[]",
          },
          {
            id: "t2",
            turn_number: 2,
            parent_message_id: "msg-2",
            actor_id: "a2",
            prompt_sent: "",
            quality_score: null,
            status: "pending",
            quest_progress: "[]",
          },
        ],
      },);
      await s._loadTurns();
      expect(s.turnMeta["msg-1"],).toEqual({
        turnNumber: 1,
        qualityScore: 92,
        promptSent: "GM: enter the cave",
        status: "completed",
      },);
      expect(s.turnNumber,).toBe(2,);
      expect(s.running,).toBe(true,);
      expect(s.promptSent,).toBe("",);
    });

    test("resets state when no turns exist", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      s.turnNumber = 5;
      s.running = true;
      mockFetch(200, { data: [], },);
      await s._loadTurns();
      expect(s.turnNumber,).toBeNull();
      expect(s.running,).toBe(false,);
      expect(s.banners,).toEqual([],);
    });
  });

  describe("_loadQuests", () => {
    test("stores quest rows from the world quests endpoint", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _worldId: string | null })._worldId = "world-1";
      mockFetch(200, {
        data: [{ id: "q1", name: "Slay the dragon", type: "composite", status: "active", progress: 50, },],
      },);
      await s._loadQuests();
      expect(s.quests.length,).toBe(1,);
      expect(s.quests[0]?.name,).toBe("Slay the dragon",);
    });

    test("no-ops without a world id", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _worldId: string | null })._worldId = null;
      await s._loadQuests();
      expect(fetchCalls,).toEqual([],);
    });
  });

  describe("_loadParticipants", () => {
    test("maps participants to turn order with GM role", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      mockFetch(200, [
        { actor_id: "gm-1", name: "GM", display_name: "Narrator", actor_type: "assistant", },
        { actor_id: "p-1", name: "Hero", display_name: null, actor_type: "character", },
      ],);
      await s._loadParticipants();
      expect(s.actors,).toEqual([
        { id: "gm-1", name: "Narrator", type: "assistant", role: "gm", isActive: true, order: 0, },
        { id: "p-1", name: "Hero", type: "character", role: "player", isActive: false, order: 1, },
      ],);
      expect(s.nextActorName,).toBe("Narrator",);
    });
  });

  describe("_loadWorldState", () => {
    test("parses location state + NPCs, tolerating shape drift", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _locationId: string | null })._locationId = "loc-1";
      (s as unknown as { _worldId: string | null })._worldId = "world-1";
      let call = 0;
      fetchHandler = (_url, _opts,) => {
        call++;
        if (call === 1) {
          return Response.json({
            id: "loc-1",
            state: {
              time_of_day: "night",
              weather: "rain",
              atmosphere: "tense",
              description_override: "dark cave",
            },
          }, { status: 200, },);
        }
        return Response.json([{ actorId: "a1", displayName: "Goblin", },], { status: 200, },);
      };
      await s._loadWorldState();
      expect(s.worldState.timeOfDay,).toBe("night",);
      expect(s.worldState.weather,).toBe("rain",);
      expect(s.worldState.atmosphere,).toBe("tense",);
      expect(s.worldState.description,).toBe("dark cave",);
      expect(s.worldState.npcs,).toEqual([{ actorId: "a1", displayName: "Goblin", },],);
    });

    test("falls back to the raw row when there is no nested state", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _locationId: string | null })._locationId = "loc-1";
      (s as unknown as { _worldId: string | null })._worldId = null;
      mockFetch(200, { id: "loc-1", time_of_day: "dawn", weather: null, atmosphere: null, },);
      await s._loadWorldState();
      expect(s.worldState.timeOfDay,).toBe("dawn",);
    });
  });

  describe("controls", () => {
    test("togglePause flips running on success", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      s.running = true;
      mockFetch(200, { ok: true, },);
      await s.togglePause();
      expect(s.running,).toBe(false,);
      expect(fetchCalls[0]?.url,).toBe("/api/chats/chat-1/story/pause",);
    });

    test("togglePause notifies instead of toggling on failure", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      s.running = true;
      const toasts: string[] = [];
      s.notify = (message: string,) => {
        toasts.push(message,);
      };
      mockFetch(404, { message: "wiring pending", },);
      await s.togglePause();
      expect(s.running,).toBe(true,);
      expect(toasts[0],).toBe("wiring pending",);
    });

    test("createQuest POSTs and reloads quests", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _worldId: string | null })._worldId = "world-1";
      let call = 0;
      fetchHandler = (_url, _opts,) => {
        call++;
        if (call === 1) { return Response.json({ id: "q-new", }, { status: 201, },); }
        return Response.json({
          data: [{ id: "q-new", name: "Side quest", type: "composite", status: "active", progress: 0, },],
        }, { status: 200, },);
      };
      await s.createQuest("Side quest",);
      expect(fetchCalls[0]?.url,).toBe("/api/worlds/world-1/quests",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ name: "Side quest", type: "composite", },);
      expect(s.quests[0]?.id,).toBe("q-new",);
    });

    test("createQuest ignores blank names", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      (s as unknown as { _worldId: string | null })._worldId = "world-1";
      await s.createQuest("   ",);
      expect(fetchCalls,).toEqual([],);
    });

    test("deleteQuest removes locally on success", async () => {
      const s = makeState();
      s.chatId = "chat-1";
      s.quests = [{ id: "q1", name: "A", type: "composite", status: "active", progress: 10, },];
      mockFetch(200, { ok: true, },);
      await s.deleteQuest("q1",);
      expect(fetchCalls[0]?.url,).toBe("/api/quests/q1",);
      expect(fetchCalls[0]?.opts.method,).toBe("DELETE",);
      expect(s.quests,).toEqual([],);
    });
  });

  describe("refresh", () => {
    test("no-ops without an active chat", async () => {
      const s = makeState();
      (s as { _activeChatId(): string | null })._activeChatId = () => null;
      await s.refresh();
      expect(fetchCalls,).toEqual([],);
      expect(s.loading,).toBe(false,);
    });

    test("skips story loads when the chat is not in story mode", async () => {
      const s = makeState();
      (s as { _activeChatId(): string | null })._activeChatId = () => "chat-1";
      let call = 0;
      fetchHandler = (_url, _opts,) => {
        call++;
        if (call === 1) {
          return Response.json({ mode: "direct", world_id: null, gm_config: "{}", }, {
            status: 200,
          },);
        }
        return Response.json({ name: "World", }, { status: 200, },);
      };
      await s.refresh();
      expect(s.isStoryMode,).toBe(false,);
      expect(call,).toBe(1,);
    });

    test("loads all story resources for a story chat", async () => {
      const s = makeState();
      (s as { _activeChatId(): string | null })._activeChatId = () => "chat-1";
      let call = 0;
      fetchHandler = (_url, _opts,) => {
        call++;
        switch (call) {
          case 1:
            return Response.json(
              { mode: "story", world_id: "world-1", current_location_id: "loc-1", gm_config: "{}", },
              { status: 200, },
            );
          case 2:
            return Response.json({ name: "Eldoria", }, { status: 200, },);
          case 3:
            return Response.json({ data: [], }, { status: 200, },);
          case 4:
            return Response.json({ data: [], }, { status: 200, },);
          case 5:
            return Response.json({ id: "loc-1", state: { time_of_day: null, }, }, { status: 200, },);
          default:
            return Response.json([], { status: 200, },);
        }
      };
      await s.refresh();
      expect(s.isStoryMode,).toBe(true,);
      expect(s.worldName,).toBe("Eldoria",);
      expect(s.loading,).toBe(false,);
    });
  });
});
