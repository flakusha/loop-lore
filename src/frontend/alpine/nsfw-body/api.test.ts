import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { toResult, } from "../nsfw-panel/api";
import { fetchArousalState, fetchRpgStats, parseConditionsJson, } from "./api";

// ── Mock ../htmx (must precede importing ./api) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("fetchRpgStats", () => {
  test("returns parsed stats on ok", async () => {
    handler = async () => Response.json({ hp: 12, maxHp: 30, conditions: "[]", },);
    const result = await fetchRpgStats("a1",);
    expect(result.status,).toBe("ok",);
    expect(result.status === "ok" && result.data.hp,).toBe(12,);
    expect(calls[0]!.url,).toBe("/api/v1/rpg/stats/a1",);
  });

  test("reports 403 as denied", async () => {
    handler = async () => new Response("forbidden", { status: 403, },);
    await expect(fetchRpgStats("a1",),).resolves.toEqual({ status: "denied", } as never,);
  });

  test("reports a missing stats row (404) as failed", async () => {
    handler = async () => new Response("no stats", { status: 404, },);
    await expect(fetchRpgStats("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });

  test("reports other non-ok statuses as failed", async () => {
    handler = async () => new Response("boom", { status: 500, },);
    await expect(fetchRpgStats("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });

  test("reports a rejected request as failed", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    await expect(fetchRpgStats("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });
},);

describeOrSkip("fetchArousalState", () => {
  test("requests the world-scoped row when a world id is given", async () => {
    handler = async () => Response.json({ level: 65, },);
    const result = await fetchArousalState("a1", "w-1",);
    expect(result.status === "ok" && result.data.level,).toBe(65,);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/arousal/a1?worldId=w-1",);
  });

  test("encodes the world id query parameter", async () => {
    handler = async () => Response.json({ level: 0, },);
    await fetchArousalState("a1", "a&b",);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/arousal/a1?worldId=a%26b",);
  });

  test("omits the query when the chat has no world", async () => {
    handler = async () => Response.json({ level: 0, },);
    await fetchArousalState("a1", null,);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/arousal/a1?",);
  });

  test("reports 403 as denied (NSFW access refused)", async () => {
    handler = async () => new Response("forbidden", { status: 403, },);
    await expect(fetchArousalState("a1", null,),).resolves.toEqual({ status: "denied", } as never,);
  });

  test("reports a rejected request as failed", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    await expect(fetchArousalState("a1", null,),).resolves.toEqual({ status: "failed", } as never,);
  });
},);

describeOrSkip("toResult", () => {
  test("classifies 403 as denied without reading the body", async () => {
    const result = await toResult<{ x: number }>(new Response("forbidden", { status: 403, },),);
    expect(result,).toEqual({ status: "denied", },);
  });

  test("classifies other non-ok statuses as failed", async () => {
    const result = await toResult<{ x: number }>(new Response("boom", { status: 500, },),);
    expect(result,).toEqual({ status: "failed", },);
  });

  test("parses the JSON body on ok", async () => {
    const result = await toResult<{ x: number }>(Response.json({ x: 1, },),);
    expect(result,).toEqual({ status: "ok", data: { x: 1, }, },);
  });

  test("reports an unreadable body as failed", async () => {
    const result = await toResult<{ x: number }>(new Response("not json", { status: 200, },),);
    expect(result,).toEqual({ status: "failed", },);
  });
},);

describeOrSkip("parseConditionsJson", () => {
  test("parses named condition rows", () => {
    const raw = JSON.stringify([
      { name: "Poisoned", source: "snake", duration_rounds: 3, },
      { name: "Blessed", },
    ],);

    expect(parseConditionsJson(raw,),).toEqual([
      { name: "Poisoned", source: "snake", duration_rounds: 3, },
      { name: "Blessed", },
    ],);
  });

  test("returns empty for empty, blank, or sentinel input", () => {
    expect(parseConditionsJson(undefined,),).toEqual([],);
    expect(parseConditionsJson("",),).toEqual([],);
    expect(parseConditionsJson("[]",),).toEqual([],);
  });

  test("returns empty for non-array JSON", () => {
    expect(parseConditionsJson('{"name":"x"}',),).toEqual([],);
  });

  test("drops entries without a string name and survives malformed JSON", () => {
    expect(parseConditionsJson('[{"source":"x"},{"name":"Poisoned"}]',),).toEqual([
      { name: "Poisoned", },
    ],);

    expect(parseConditionsJson("not json",),).toEqual([],);
  });
},);
