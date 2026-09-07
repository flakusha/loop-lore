import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  applyHappinessDelta,
  fetchEmotionDefs,
  fetchEmotions,
  fetchMood,
} from "./api";

// ── Mock ../htmx (must precede importing ./api) ──
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

describe("fetchMood", () => {
  test("returns parsed mood on ok", async () => {
    handler = async () => Response.json({ happiness: 77, currentMood: "happy", },);
    await expect(fetchMood("a1",),).resolves.toEqual({ happiness: 77, currentMood: "happy", } as never,);
    expect(calls[0]!.url,).toBe("/api/actors/a1/mood",);
  });

  test("returns null on non-ok status", async () => {
    handler = async () => new Response("nope", { status: 404, },);
    await expect(fetchMood("a1",),).resolves.toBeNull();
  });

  test("returns null when the request rejects", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    await expect(fetchMood("a1",),).resolves.toBeNull();
  });
});

describe("fetchEmotions", () => {
  test("returns parsed entries on ok", async () => {
    handler = async () => Response.json([{ emotion_id: "e1", intensity: 0.9, },],);
    await expect(fetchEmotions("a2",),).resolves.toEqual([{ emotion_id: "e1", intensity: 0.9, },] as never,);
    expect(calls[0]!.url,).toBe("/api/actors/a2/emotions",);
  });

  test("returns empty array on non-ok and on rejection", async () => {
    handler = async () => new Response("", { status: 500, },);
    await expect(fetchEmotions("a2",),).resolves.toEqual([],);
    handler = async () => {
      throw new Error("offline",);
    };
    await expect(fetchEmotions("a2",),).resolves.toEqual([],);
  });
});

describe("fetchEmotionDefs", () => {
  test("returns parsed definitions on ok", async () => {
    handler = async () => Response.json([{ id: "joy", display_name: "Joy", icon: "i", },],);
    await expect(fetchEmotionDefs(),).resolves.toEqual([{ id: "joy", display_name: "Joy", icon: "i", },] as never,);
    expect(calls[0]!.url,).toBe("/api/emotions",);
  });

  test("returns empty array on non-ok and on rejection", async () => {
    handler = async () => new Response("", { status: 503, },);
    await expect(fetchEmotionDefs(),).resolves.toEqual([],);
    handler = async () => {
      throw new Error("offline",);
    };
    await expect(fetchEmotionDefs(),).resolves.toEqual([],);
  });
});

describe("applyHappinessDelta", () => {
  test("POSTs delta and worldId and returns the new happiness", async () => {
    handler = async () => Response.json(72,);
    await expect(applyHappinessDelta("a3", 5, "w1",),).resolves.toBe(72,);
    expect(calls[0]!.url,).toBe("/api/actors/a3/mood/delta",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({ delta: 5, worldId: "w1", },);
  });

  test("omits worldId when not provided", async () => {
    handler = async () => Response.json(50,);
    await expect(applyHappinessDelta("a3", -10,),).resolves.toBe(50,);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({ delta: -10, worldId: undefined, },);
  });

  test("returns null on non-ok status and on rejection", async () => {
    handler = async () => new Response("", { status: 400, },);
    await expect(applyHappinessDelta("a3", 1,),).resolves.toBeNull();
    handler = async () => {
      throw new Error("offline",);
    };
    await expect(applyHappinessDelta("a3", 1,),).resolves.toBeNull();
  });
});
