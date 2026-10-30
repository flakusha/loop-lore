import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { fetchBodyProfile, fetchIntimacyPairs, } from "./api";

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

describeOrSkip("fetchIntimacyPairs", () => {
  test("returns parsed pairs on ok", async () => {
    handler = async () =>
      Response.json([{ actorId: "a1", targetActorId: "u1", score: 42, unlockedThresholds: [10,], },],);

    const result = await fetchIntimacyPairs("a1",);
    expect(result.status,).toBe("ok",);
    expect(result.status === "ok" && result.data[0]?.score,).toBe(42,);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/intimacy/a1",);
  });

  test("normalizes a non-array body to an empty list", async () => {
    handler = async () => Response.json({ nope: true, },);
    const result = await fetchIntimacyPairs("a1",);
    expect(result.status === "ok" && result.data,).toEqual([],);
  });

  test("reports 403 as denied", async () => {
    handler = async () => new Response("forbidden", { status: 403, },);
    await expect(fetchIntimacyPairs("a1",),).resolves.toEqual({ status: "denied", } as never,);
  });

  test("reports other non-ok statuses as failed", async () => {
    handler = async () => new Response("boom", { status: 500, },);
    await expect(fetchIntimacyPairs("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });

  test("reports a rejected request as failed", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    await expect(fetchIntimacyPairs("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });
},);

describeOrSkip("fetchBodyProfile", () => {
  test("returns parsed profile on ok", async () => {
    handler = async () => Response.json({ stamina: 80, flexibility: 60, sizeCategory: "curvy", },);
    const result = await fetchBodyProfile("a1",);
    expect(result.status === "ok" && result.data.stamina,).toBe(80,);
    expect(calls[0]!.url,).toBe("/api/v1/nsfw/body/a1",);
  });

  test("reports 403 as denied", async () => {
    handler = async () => new Response("forbidden", { status: 403, },);
    await expect(fetchBodyProfile("a1",),).resolves.toEqual({ status: "denied", } as never,);
  });

  test("reports a rejected request as failed", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    await expect(fetchBodyProfile("a1",),).resolves.toEqual({ status: "failed", } as never,);
  });
},);
