import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { nsfwPanelState, } from "./state";

// ── Mock ../htmx (must precede importing ./state) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push(url,);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface NsfwCtx {
  activeChat: string | null;
  _participants: { actor_id: string; display_name: string }[];
  _nsfwIntimacy: unknown;
  _nsfwBody: unknown;
  _nsfwUnavailable: boolean;
  loadNsfwPanel: () => Promise<void>;
}

function buildCtx(overrides?: Partial<NsfwCtx>,): NsfwCtx {
  const ctx: NsfwCtx = {
    activeChat: "chat-1",
    _participants: [],
    _nsfwIntimacy: null,
    _nsfwBody: null,
    _nsfwUnavailable: false,
    loadNsfwPanel: async () => {},
    ...overrides,
  };

  ctx.loadNsfwPanel = () => nsfwPanelState.loadNsfwPanel!.call(ctx as never,) as Promise<void>;
  return ctx;
}

/** Route the three endpoints the panel touches; unhandled URLs 404. */
function routeResponses(opts?: {
  characterId?: string | null;
  pairs?: unknown;
  body?: unknown;
  pairsStatus?: number;
  bodyStatus?: number;
  chatStatus?: number;
},): void {
  handler = async (url,) => {
    if (url.includes("/api/v1/chats/",)) {
      if (opts?.chatStatus && opts.chatStatus !== 200) {
        return new Response("nope", { status: opts.chatStatus, },);
      }

      return Response.json({ character_id: opts?.characterId ?? null, },);
    }

    if (url.includes("/nsfw/intimacy/",)) {
      if (opts?.pairsStatus && opts.pairsStatus !== 200) {
        return new Response("nope", { status: opts.pairsStatus, },);
      }

      return Response.json(opts?.pairs ?? [],);
    }

    if (url.includes("/nsfw/body/",)) {
      if (opts?.bodyStatus && opts.bodyStatus !== 200) {
        return new Response("nope", { status: opts.bodyStatus, },);
      }

      return Response.json(opts?.body ?? {},);
    }

    return new Response("not found", { status: 404, },);
  };
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

/** A manually-resolved promise — keeps the stale-response test deterministic. */
function deferred<T,>() {
  let resolve!: (value: T,) => void;
  const promise = new Promise<T>((res,) => {
    resolve = res;
  },);

  return { promise, resolve, };
}

describeOrSkip("loadNsfwPanel", () => {
  test("resolves the character from the chat and loads both sections", async () => {
    routeResponses({
      characterId: "actor-1",
      pairs: [{ actorId: "actor-1", targetActorId: "u1", score: 42, unlockedThresholds: [10,], },],
      body: { stamina: 80, flexibility: 60, sensitivity: 70, endurance: 90, sizeCategory: "curvy", build: "slim", },
    },);

    const ctx = buildCtx();
    await ctx.loadNsfwPanel();

    expect(calls[0],).toBe("/api/v1/chats/chat-1",);
    expect(calls,).toContain("/api/v1/nsfw/intimacy/actor-1",);
    expect(calls,).toContain("/api/v1/nsfw/body/actor-1",);
    expect(ctx._nsfwUnavailable,).toBe(false,);
    expect((ctx._nsfwIntimacy as { score: number }[])[0]?.score,).toBe(42,);
    expect((ctx._nsfwBody as { stamina: number }).stamina,).toBe(80,);
  });

  test("resolves the pair target to a participant display name", async () => {
    routeResponses({
      characterId: "actor-1",
      pairs: [{ actorId: "actor-1", targetActorId: "u1", score: 42, unlockedThresholds: [], },],
      body: {},
    },);

    const ctx = buildCtx({ _participants: [{ actor_id: "u1", display_name: "Alice", },], },);
    await ctx.loadNsfwPanel();

    expect((ctx._nsfwIntimacy as { targetDisplayName: string | null }[])[0]?.targetDisplayName,).toBe("Alice",);
  });

  test("hides the panel when the character is not accessible", async () => {
    routeResponses({ characterId: "actor-1", pairsStatus: 403, bodyStatus: 403, },);
    const ctx = buildCtx();
    await ctx.loadNsfwPanel();

    expect(ctx._nsfwUnavailable,).toBe(true,);
    expect(ctx._nsfwIntimacy,).toBeNull();
    expect(ctx._nsfwBody,).toBeNull();
  });

  test("leaves the panel empty when the chat has no character", async () => {
    routeResponses({ characterId: null, },);
    const ctx = buildCtx();
    await ctx.loadNsfwPanel();

    expect(ctx._nsfwUnavailable,).toBe(false,);
    expect(ctx._nsfwIntimacy,).toBeNull();
    expect(ctx._nsfwBody,).toBeNull();
    expect(calls.some((u,) => u.includes("/nsfw/",)),).toBe(false,);
  });

  test("clears state when there is no active chat", async () => {
    const ctx = buildCtx({ activeChat: null, _nsfwUnavailable: true, _nsfwIntimacy: [1,], _nsfwBody: {}, },);
    await ctx.loadNsfwPanel();

    expect(ctx._nsfwUnavailable,).toBe(false,);
    expect(ctx._nsfwIntimacy,).toBeNull();
    expect(ctx._nsfwBody,).toBeNull();
    expect(calls.length,).toBe(0,);
  });

  test("keeps the body section when only the intimacy list fails", async () => {
    routeResponses({ characterId: "actor-1", pairsStatus: 500, body: { stamina: 55, }, },);
    const ctx = buildCtx();
    await ctx.loadNsfwPanel();

    expect(ctx._nsfwUnavailable,).toBe(false,);
    expect(ctx._nsfwIntimacy,).toBeNull();
    expect((ctx._nsfwBody as { stamina: number }).stamina,).toBe(55,);
  });

  test("never throws when the chat request fails", async () => {
    routeResponses({ chatStatus: 500, },);
    const ctx = buildCtx();
    await ctx.loadNsfwPanel();

    expect(ctx._nsfwUnavailable,).toBe(false,);
    expect(ctx._nsfwIntimacy,).toBeNull();
    expect(ctx._nsfwBody,).toBeNull();
  });

  test("drops a stale response when the active chat changed while it was in flight", async () => {
    // Chat A's request is held open until chat B has fully loaded, so A's
    // response lands AFTER B's and must not overwrite B's panel state.
    const chatA = deferred<Response>();
    handler = async (url,) => {
      if (url === "/api/v1/chats/chat-a") { return chatA.promise; }
      if (url === "/api/v1/chats/chat-b") { return Response.json({ character_id: "actor-b", },); }
      if (url.includes("/nsfw/intimacy/actor-a",)) {
        return Response.json([{ actorId: "actor-a", targetActorId: "u1", score: 11, unlockedThresholds: [], },],);
      }

      if (url.includes("/nsfw/body/actor-a",)) { return Response.json({ stamina: 11, },); }
      if (url.includes("/nsfw/intimacy/actor-b",)) {
        return Response.json([{ actorId: "actor-b", targetActorId: "u1", score: 99, unlockedThresholds: [], },],);
      }

      if (url.includes("/nsfw/body/actor-b",)) { return Response.json({ stamina: 99, },); }
      return new Response("not found", { status: 404, },);
    };

    const ctx = buildCtx({ activeChat: "chat-a", },);
    const loadA = ctx.loadNsfwPanel();

    // The user selects chat B while A's request is still open.
    ctx.activeChat = "chat-b";
    await ctx.loadNsfwPanel();
    expect((ctx._nsfwIntimacy as { score: number }[])[0]?.score,).toBe(99,);
    expect((ctx._nsfwBody as { stamina: number }).stamina,).toBe(99,);

    // A's response finally arrives — it is stale and must be ignored.
    chatA.resolve(Response.json({ character_id: "actor-a", },),);
    await loadA;

    expect((ctx._nsfwIntimacy as { score: number }[])[0]?.score,).toBe(99,);
    expect((ctx._nsfwBody as { stamina: number }).stamina,).toBe(99,);
  });
},);
