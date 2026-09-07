import { afterEach, describe, expect, mock, test, } from "bun:test";
import { createMoodPanelState, } from "./factory";

// ── Mock ../htmx (must precede importing ./factory) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describe("createMoodPanelState", () => {
  test("starts with empty defaults", () => {
    const state = createMoodPanelState();
    expect(state.mood,).toBeNull();
    expect(state.emotions,).toEqual([],);
    expect(state.emotionDefs,).toEqual([],);
    expect(state.loading,).toBe(false,);
    expect(state._happinessDelta,).toBe(5,);
  });

  test("loadMood stores the parsed mood on ok", async () => {
    const state = createMoodPanelState();
    handler = async () => Response.json({ happiness: 90, currentMood: "ecstatic", },);
    await state.loadMood("a1",);
    expect(calls[0]!.url,).toBe("/api/actors/a1/mood",);
    expect(state.mood,).toEqual({ happiness: 90, currentMood: "ecstatic", } as never,);
  });

  test("loadMood leaves mood untouched on non-ok and swallows rejections", async () => {
    const state = createMoodPanelState();
    handler = async () => new Response("", { status: 500, },);
    await state.loadMood("a1",);
    expect(state.mood,).toBeNull();
    handler = async () => {
      throw new Error("offline",);
    };
    await state.loadMood("a1",);
    expect(state.mood,).toBeNull();
  });

  test("loadEmotions and loadEmotionDefs populate their lists", async () => {
    const state = createMoodPanelState();
    handler = async (url,) =>
      url === "/api/actors/a1/emotions"
        ? Response.json([{ emotion_id: "joy", intensity: 1, },],)
        : Response.json([{ id: "joy", display_name: "Joy", icon: null, },],);
    await state.loadEmotions("a1",);
    await state.loadEmotionDefs();
    expect(state.emotions,).toEqual([{ emotion_id: "joy", intensity: 1, },] as never,);
    expect(state.emotionDefs,).toEqual([{ id: "joy", display_name: "Joy", icon: null, },] as never,);
  });

  test("applyHappinessDelta updates happiness and re-derives currentMood", async () => {
    const state = createMoodPanelState();
    state.mood = { happiness: 85, currentMood: "ecstatic", } as never;
    handler = async () => Response.json(30,);
    await state.applyHappinessDelta("a1", -55,);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(state.mood,).toEqual({ happiness: 30, currentMood: "sad", } as never,);
  });

  test("applyHappinessDelta is a no-op without a loaded mood", async () => {
    const state = createMoodPanelState();
    await state.applyHappinessDelta("a1", 10,);
    expect(state.mood,).toBeNull();
  });

  test("getters fall back to neutral defaults without a mood", () => {
    const state = createMoodPanelState();
    expect(state.getMoodEmoji(),).toBe("😐",);
    expect(state.getMoodLabel(),).toBe("Neutral",);
    expect(state.getHappinessColor(),).toBe("var(--text-secondary,)",);
  });

  test("getters reflect the loaded mood", () => {
    const state = createMoodPanelState();
    state.mood = { happiness: 95, currentMood: "ecstatic", } as never;
    expect(state.getMoodEmoji(),).toBe("😄",);
    expect(state.getMoodLabel(),).toBe("Ecstatic",);
    expect(state.getHappinessColor(),).toBe("var(--accent-green,)",);
  });

  test("getActiveEmotions joins entries with definitions and skips unknown ids", () => {
    const state = createMoodPanelState();
    state.emotionDefs = [
      { id: "joy", display_name: "Joy", icon: "i", },
      { id: "calm", display_name: "Calm", icon: null, },
    ] as never;
    state.emotions = [
      { emotion_id: "joy", intensity: 0.8, },
      { emotion_id: "ghost", intensity: 1, },
      { emotion_id: "calm", intensity: 0.2, },
    ] as never;
    expect(state.getActiveEmotions(),).toEqual([
      { def: { id: "joy", display_name: "Joy", icon: "i", }, intensity: 0.8, },
      { def: { id: "calm", display_name: "Calm", icon: null, }, intensity: 0.2, },
    ] as never,);
  });

  test("happinessToMood boundary mapping", () => {
    const state = createMoodPanelState();
    expect(state.happinessToMood(100,),).toBe("ecstatic",);
    expect(state.happinessToMood(80,),).toBe("ecstatic",);
    expect(state.happinessToMood(60,),).toBe("happy",);
    expect(state.happinessToMood(45,),).toBe("neutral",);
    expect(state.happinessToMood(25,),).toBe("sad",);
    expect(state.happinessToMood(0,),).toBe("miserable",);
  });
});

describe("createMoodPanelState — rejection paths", () => {
  test("loadEmotions swallows rejections and keeps the old list", async () => {
    const state = createMoodPanelState();
    state.emotions = [{ emotion_id: "calm", intensity: 0.5, },] as never;
    handler = async () => {
      throw new Error("offline",);
    };
    await state.loadEmotions("a1",);
    expect(state.emotions,).toEqual([{ emotion_id: "calm", intensity: 0.5, },] as never,);
    expect(state.loading,).toBe(false,);
  });

  test("loadEmotionDefs swallows rejections and keeps the old list", async () => {
    const state = createMoodPanelState();
    state.emotionDefs = [{ id: "joy", display_name: "Joy", icon: null, },] as never;
    handler = async () => {
      throw new Error("offline",);
    };
    await state.loadEmotionDefs();
    expect(state.emotionDefs,).toEqual([{ id: "joy", display_name: "Joy", icon: null, },] as never,);
  });

  test("applyHappinessDelta swallows rejections and keeps the old mood", async () => {
    const state = createMoodPanelState();
    state.mood = { happiness: 70, currentMood: "happy", } as never;
    handler = async () => {
      throw new Error("offline",);
    };
    await state.applyHappinessDelta("a1", 20,);
    expect(state.mood,).toEqual({ happiness: 70, currentMood: "happy", } as never,);
  });
});
