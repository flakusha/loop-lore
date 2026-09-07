import { afterEach, describe, expect, mock, test, } from "bun:test";
import { moodStateEmotions, } from "./emotions";

// ── Mock ../htmx (must precede importing ./emotions) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push(url,);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

/** Minimal ChatState slice loadEmotions touches. */
interface EmotionsCtx {
  _getCharacterActorId: () => string | null;
  _activeEmotionsLoading: boolean;
  _activeEmotions: { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
}

function buildCtx(actorId: string | null,): EmotionsCtx {
  return {
    _getCharacterActorId: () => actorId,
    _activeEmotionsLoading: false,
    _activeEmotions: [],
  };
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
},);

describe("moodStateEmotions.loadEmotions", () => {
  test("returns early when the chat has no character actor", async () => {
    const ctx = buildCtx(null,);
    await moodStateEmotions.loadEmotions!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx._activeEmotionsLoading,).toBe(false,);
  });

  test("joins active emotions with definitions", async () => {
    const ctx = buildCtx("actor-1",);
    handler = async (url,) =>
      url === "/api/actors/actor-1/emotions"
        ? Response.json([
          { emotion_id: "joy", intensity: 0.9, },
          { emotion_id: "calm", intensity: 0.1, },
          { emotion_id: "ghost", intensity: 1, },
        ],)
        : Response.json([
          { id: "joy", display_name: "Joy", icon: "😊", },
          { id: "calm", display_name: "Calm", },
        ],);
    await moodStateEmotions.loadEmotions!.call(ctx as never,);
    expect(calls,).toEqual(["/api/actors/actor-1/emotions", "/api/emotions",],);
    expect(ctx._activeEmotions,).toEqual([
      { def: { id: "joy", icon: "😊", display_name: "Joy", }, intensity: 0.9, },
      // Missing icon falls back to null.
      { def: { id: "calm", icon: null, display_name: "Calm", }, intensity: 0.1, },
    ],);
    expect(ctx._activeEmotionsLoading,).toBe(false,);
  });

  test("accepts envelope responses and defaults missing intensity", async () => {
    const ctx = buildCtx("actor-1",);
    handler = async (url,) =>
      url === "/api/actors/actor-1/emotions"
        ? Response.json({ data: [{ emotion_id: "joy", },], },)
        : Response.json({ data: [{ id: "joy", display_name: "Joy", icon: null, },], },);
    await moodStateEmotions.loadEmotions!.call(ctx as never,);
    expect(ctx._activeEmotions,).toEqual([
      { def: { id: "joy", icon: null, display_name: "Joy", }, intensity: 0.5, },
    ],);
  });

  test("keeps prior emotions when either response is non-ok", async () => {
    const ctx = buildCtx("actor-1",);
    ctx._activeEmotions = [{ def: { id: "old", icon: null, display_name: "Old", }, intensity: 1, },];
    handler = async (url,) =>
      url === "/api/actors/actor-1/emotions"
        ? new Response("", { status: 500, },)
        : Response.json([],);
    await moodStateEmotions.loadEmotions!.call(ctx as never,);
    expect(ctx._activeEmotions,).toHaveLength(1,);
    expect(ctx._activeEmotions[0]!.def.id,).toBe("old",);
  });

  test("survives a rejected fetch and resets the loading flag", async () => {
    const ctx = buildCtx("actor-1",);
    handler = async () => {
      throw new Error("offline",);
    };
    await moodStateEmotions.loadEmotions!.call(ctx as never,);
    expect(ctx._activeEmotions,).toEqual([],);
    expect(ctx._activeEmotionsLoading,).toBe(false,);
  });
});

describe("moodStateEmotions.getActiveEmotions", () => {
  test("returns the stored list", () => {
    const ctx = buildCtx("a",);
    ctx._activeEmotions = [{ def: { id: "joy", icon: null, display_name: "Joy", }, intensity: 1, },];
    expect(moodStateEmotions.getActiveEmotions!.call(ctx as never,),).toEqual(ctx._activeEmotions,);
  });
});
