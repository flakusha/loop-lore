import { afterEach, describe, expect, mock, test, } from "bun:test";
import { moodStateLoading, } from "./loading";

// ── Mock ../htmx (must precede importing ./loading) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface Mood {
  happiness: number;
  currentMood: string;
  baseMood: string;
  moodStability: number;
  lastMoodChange: string;
  expressionModifiers: Record<string, unknown>;
}

interface MoodLoadingCtx {
  activeChat: string | null;
  userRole: string;
  _moodLoading: boolean;
  _mood: Mood | null;
  _moodSliderValue: number;
  _activeChatWorldId: string | null;
  _moodCanEdit: boolean;
  loadEmotionAvatars: () => Promise<void>;
  loadEmotions: () => Promise<void>;
  _happinessToMood: (happiness: number,) => string;
}

const npcParticipants = [{ role_in_chat: "member", actor_type: "npc", actor_id: "actor-9", },];

function buildCtx(overrides?: Partial<MoodLoadingCtx>,): MoodLoadingCtx {
  const ctx: MoodLoadingCtx = {
    activeChat: "chat-1",
    userRole: "user",
    _moodLoading: false,
    _mood: null,
    _moodSliderValue: 0,
    _activeChatWorldId: null,
    _moodCanEdit: false,
    loadEmotionAvatars: async () => {},
    loadEmotions: async () => {},
    // Delegate so updateMoodHappiness exercises the real threshold mapping.
    _happinessToMood: (happiness,) => moodStateLoading._happinessToMood!.call(ctx, happiness,),
    ...overrides,
  };
  return ctx;
}

/** Stub the three endpoints loadMood touches; unhandled URLs 404. */
function routeResponses(opts?: {
  participants?: unknown;
  chat?: unknown;
  mood?: unknown;
  participantsStatus?: number;
  chatStatus?: number;
  moodStatus?: number;
  rejectParticipants?: boolean;
  rejectChat?: boolean;
},): void {
  handler = async (url,) => {
    if (url.endsWith("/participants",)) {
      if (opts?.rejectParticipants) { throw new Error("offline",); }
      return opts?.participantsStatus
        ? new Response("", { status: opts.participantsStatus, },)
        : Response.json(opts?.participants ?? npcParticipants,);
    }
    if (url === "/api/v1/chats/chat-1") {
      if (opts?.rejectChat) { throw new Error("offline",); }
      return opts?.chatStatus
        ? new Response("", { status: opts.chatStatus, },)
        : Response.json(opts?.chat ?? { world_id: "w1", },);
    }
    if (url.startsWith("/api/actors/actor-9/mood",)) {
      return opts?.moodStatus
        ? new Response("", { status: opts.moodStatus, },)
        : Response.json(opts?.mood ?? { happiness: 72, },);
    }
    return new Response("", { status: 404, },);
  };
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
});

describe("moodStateLoading.loadMood", () => {
  test("returns early without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(calls,).toEqual([],);
    expect(ctx._moodLoading,).toBe(false,);
  });

  test("stops when participants respond non-ok", async () => {
    const ctx = buildCtx();
    routeResponses({ participantsStatus: 500, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._mood,).toBeNull();
    expect(ctx._moodLoading,).toBe(false,);
  });

  test("stops when no member NPC participates", async () => {
    const ctx = buildCtx();
    routeResponses({ participants: [{ role_in_chat: "observer", actor_type: "user", actor_id: "x", },], },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(calls,).toHaveLength(1,);
    expect(ctx._mood,).toBeNull();
  });

  test("handles non-array participant envelopes", async () => {
    const ctx = buildCtx();
    routeResponses({ participants: { data: [] }, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(calls,).toHaveLength(1,);
  });

  test("resolves the world, normalizes mood defaults and delegates to loaders", async () => {
    let avatarsLoaded = 0;
    let emotionsLoaded = 0;
    const ctx = buildCtx({
      loadEmotionAvatars: async () => {
        avatarsLoaded += 1;
      },
      loadEmotions: async () => {
        emotionsLoaded += 1;
      },
    },);
    routeResponses({ mood: { happiness: 72, }, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(calls.some((c,) => c.url === "/api/actors/actor-9/mood?worldId=w1",),).toBe(true,);
    expect(ctx._activeChatWorldId,).toBe("w1",);
    expect(ctx._mood,).toEqual({
      happiness: 72,
      currentMood: "neutral",
      baseMood: "neutral",
      moodStability: 0.5,
      lastMoodChange: "",
      expressionModifiers: {},
    },);
    expect(ctx._moodSliderValue,).toBe(72,);
    expect(ctx._moodCanEdit,).toBe(false,);
    expect(avatarsLoaded,).toBe(1,);
    expect(emotionsLoaded,).toBe(1,);
    expect(ctx._moodLoading,).toBe(false,);
  });

  test("falls back to the global mood record when the chat lookup fails", async () => {
    const ctx = buildCtx();
    routeResponses({ chatStatus: 500, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._activeChatWorldId,).toBeNull();
    expect(ctx._mood,).not.toBeNull();
  });

  test("survives a rejected chat lookup", async () => {
    const ctx = buildCtx();
    routeResponses({ rejectChat: true, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._activeChatWorldId,).toBeNull();
    expect(ctx._mood,).not.toBeNull();
  });

  test("leaves mood unset when the mood endpoint is non-ok but still flags editors", async () => {
    const ctx = buildCtx({ userRole: "admin", },);
    routeResponses({ moodStatus: 503, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._mood,).toBeNull();
    expect(ctx._moodCanEdit,).toBe(true,);
  });

  test("solo users may edit mood", async () => {
    const ctx = buildCtx({ userRole: "solo", },);
    routeResponses({},);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._moodCanEdit,).toBe(true,);
  });

  test("swallows participant fetch failures and resets the loading flag", async () => {
    const ctx = buildCtx();
    routeResponses({ rejectParticipants: true, },);
    await moodStateLoading.loadMood!.call(ctx,);
    expect(ctx._mood,).toBeNull();
    expect(ctx._moodLoading,).toBe(false,);
  });
});

describe("moodStateLoading.updateMoodHappiness", () => {
  test("is a no-op without a loaded mood", async () => {
    const ctx = buildCtx();
    await moodStateLoading.updateMoodHappiness!.call(ctx, 66,);
    expect(calls,).toEqual([],);
  });

  test("is a no-op without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, _mood: mood(50,), },);
    await moodStateLoading.updateMoodHappiness!.call(ctx, 66,);
    expect(calls,).toEqual([],);
  });

  test("PUTs the new happiness and re-derives the mood label", async () => {
    const ctx = buildCtx({ _mood: mood(50,), },);
    routeResponses({},);
    await moodStateLoading.updateMoodHappiness!.call(ctx, 66,);
    const put = calls.find((c,) => c.opts.method === "PUT",)!;
    expect(put.url,).toBe("/api/actors/actor-9/mood",);
    expect(JSON.parse(String(put.opts.body,),),).toEqual({ happiness: 66, worldId: undefined, },);
    expect(ctx._mood!.happiness,).toBe(66,);
    expect(ctx._mood!.currentMood,).toBe("happy",);
  });

  test("stops on non-ok participants and swallows network errors", async () => {
    const ctx = buildCtx({ _mood: mood(50,), },);
    routeResponses({ participantsStatus: 403, },);
    await moodStateLoading.updateMoodHappiness!.call(ctx, 66,);
    expect(ctx._mood!.happiness,).toBe(50,);
    routeResponses({ rejectParticipants: true, },);
    await moodStateLoading.updateMoodHappiness!.call(ctx, 66,);
    expect(ctx._mood!.happiness,).toBe(50,);
  });
});

describe("moodStateLoading.applyMoodDelta", () => {
  test("is a no-op without a loaded mood", async () => {
    const ctx = buildCtx();
    await moodStateLoading.applyMoodDelta!.call(ctx, 5,);
    expect(calls,).toEqual([],);
  });

  test("POSTs the delta and adopts the server mood", async () => {
    const ctx = buildCtx({ _mood: mood(30,), },);
    routeResponses({ mood: { happiness: 35, current_mood: "neutral", }, },);
    await moodStateLoading.applyMoodDelta!.call(ctx, 5,);
    const post = calls.find((c,) => c.opts.method === "POST",)!;
    expect(post.url,).toBe("/api/actors/actor-9/mood/delta",);
    expect(JSON.parse(String(post.opts.body,),),).toEqual({ delta: 5, worldId: undefined, },);
    expect(ctx._mood!.happiness,).toBe(35,);
    expect(ctx._mood!.currentMood,).toBe("neutral",);
    expect(ctx._moodSliderValue,).toBe(35,);
  });

  test("keeps the old mood on non-ok responses and network errors", async () => {
    const ctx = buildCtx({ _mood: mood(30,), },);
    routeResponses({ moodStatus: 400, },);
    await moodStateLoading.applyMoodDelta!.call(ctx, 5,);
    expect(ctx._mood!.happiness,).toBe(30,);
    routeResponses({ rejectParticipants: true, },);
    await moodStateLoading.applyMoodDelta!.call(ctx, 5,);
    expect(ctx._mood!.happiness,).toBe(30,);
  });
});

describe("mood display helpers", () => {
  test("_happinessToMood boundaries", () => {
    expect(moodStateLoading._happinessToMood!.call({} as never, 100,),).toBe("ecstatic",);
    expect(moodStateLoading._happinessToMood!.call({} as never, 60,),).toBe("happy",);
    expect(moodStateLoading._happinessToMood!.call({} as never, 45,),).toBe("neutral",);
    expect(moodStateLoading._happinessToMood!.call({} as never, 25,),).toBe("sad",);
    expect(moodStateLoading._happinessToMood!.call({} as never, 0,),).toBe("miserable",);
  });

  test("_getMoodEmoji maps known moods and falls back", () => {
    expect(moodStateLoading._getMoodEmoji!.call({} as never, "happy",),).toBe("😊",);
    expect(moodStateLoading._getMoodEmoji!.call({} as never, "angry",),).toBe("😠",);
    expect(moodStateLoading._getMoodEmoji!.call({} as never, "bored",),).toBe("😴",);
    expect(moodStateLoading._getMoodEmoji!.call({} as never, "mystery",),).toBe("😐",);
  });

  test("_getMoodColor thresholds", () => {
    expect(moodStateLoading._getMoodColor!.call({} as never, 80,),).toBe("#22c55e",);
    expect(moodStateLoading._getMoodColor!.call({} as never, 60,),).toBe("#84cc16",);
    expect(moodStateLoading._getMoodColor!.call({} as never, 45,),).toBe("#eab308",);
    expect(moodStateLoading._getMoodColor!.call({} as never, 25,),).toBe("#f97316",);
    expect(moodStateLoading._getMoodColor!.call({} as never, 10,),).toBe("#ef4444",);
  });
});

function mood(happiness: number,): Mood {
  return {
    happiness,
    currentMood: "neutral",
    baseMood: "neutral",
    moodStability: 0.5,
    lastMoodChange: "",
    expressionModifiers: {},
  };
}
