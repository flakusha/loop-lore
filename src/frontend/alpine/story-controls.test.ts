import { afterEach, describe, expect, mock, test, } from "bun:test";
import { storyControl, } from "./story-controls";
import type { StoryControlAction, } from "./story-controls";

// ── Mock apiFetch (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;
let fetchError: Error | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (fetchError) { throw fetchError; }
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown,): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  fetchError = null;
},);

describe("storyControl", () => {
  const actions: StoryControlAction[] = ["pause", "resume", "step",];

  for (const action of actions) {
    test(`POSTs ${action} to the story endpoint`, async () => {
      mockFetch(200, { ok: true, },);
      const result = await storyControl("chat-1", action,);
      expect(result.ok,).toBe(true,);
      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe(`/api/chats/chat-1/story/${action}`,);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
    });
  }

  test("includes an optional JSON body", async () => {
    mockFetch(200, { ok: true, },);
    await storyControl("chat-1", "narration", { text: "The door creaks.", },);
    expect(fetchCalls[0]?.url,).toBe("/api/chats/chat-1/story/narration",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ text: "The door creaks.", },);
  });

  test("omits the body when none is given", async () => {
    mockFetch(200, { ok: true, },);
    await storyControl("chat-1", "step",);
    expect(fetchCalls[0]?.opts.body,).toBeUndefined();
  });

  test("returns ok:false with the server message on non-OK response", async () => {
    mockFetch(404, { message: "story engine wiring pending", },);
    const result = await storyControl("chat-1", "step",);
    expect(result.ok,).toBe(false,);
    expect(result.message,).toBe("story engine wiring pending",);
  });

  test("falls back to a default message when the error body has none", async () => {
    mockFetch(500, {},);
    const result = await storyControl("chat-1", "step",);
    expect(result.ok,).toBe(false,);
    expect(result.message,).toContain("step",);
    expect(result.message,).toContain("500",);
  });

  test("returns a graceful failure on network error", async () => {
    fetchError = new Error("network",);
    const result = await storyControl("chat-1", "escalate",);
    expect(result.ok,).toBe(false,);
    expect(result.message,).toContain("unavailable",);
  });
});
