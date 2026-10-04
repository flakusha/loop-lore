import { afterAll, beforeEach, expect, it, mock, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import "./gm-guidance";

// ── Mock apiFetch (init / loadGmParticipants / applyGmGuidance) ────────
const fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: (url: string, opts?: RequestInit,) => Promise<Response> = async () =>
  new Response("{}", { status: 200, },);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      return fetchHandler(url, opts,);
    },
  }),);
}

/**
 * Pure-logic tests for the GM-guidance Alpine component (`gmGuidance`).
 * `apiFetch`-backed methods (applyGmGuidance) are covered by the route/service
 * tests; these exercise the local state mutations that have no I/O.
 */

const gmGuidance = (globalThis as unknown as Record<string, () => Record<string, unknown>>).gmGuidance!;

describeOrSkip("gmGuidance state", () => {
  /** */
  function freshState() {
    const s = gmGuidance() as Record<string, unknown>;
    s._gmGuidance = { constraints: [], turnPriority: {}, };
    s._gmNewConstraint = "";
    return s;
  }

  it("adds a constraint and clears the input", () => {
    const s = freshState();
    s._gmNewConstraint = "stay in character";
    (s.addGmConstraint as () => void).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints,).toContain("stay in character",);
    expect(s._gmNewConstraint,).toBe("",);
  });

  it("ignores duplicate constraints", () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["x",], turnPriority: {}, };
    s._gmNewConstraint = "x";
    (s.addGmConstraint as () => void).call(s,);
    const count = (s._gmGuidance as { constraints: string[] }).constraints.filter((c,) => c === "x").length;
    expect(count,).toBe(1,);
  });

  it("ignores blank constraints", () => {
    const s = freshState();
    s._gmNewConstraint = " ".repeat(3,);
    (s.addGmConstraint as () => void).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints.length,).toBe(0,);
  });

  it("removes a constraint", () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["a", "b",], turnPriority: {}, };
    (s.removeGmConstraint as (c: string,) => void).call(s, "a",);
    expect((s._gmGuidance as { constraints: string[] }).constraints,).toEqual(["b",],);
  });

  it("sets per-participant turn priority", () => {
    const s = freshState();
    (s.setGmTurnPriority as (id: string, l: string,) => void).call(s, "actor-1", "high",);
    expect((s._gmGuidance as { turnPriority: Record<string, string> }).turnPriority["actor-1"],).toBe("high",);
  });

  it("clearGmGuidance resets local state (apply is I/O)", async () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["a",], turnPriority: { "actor-1": "high", }, };
    let applied = false;
    (s as { applyGmGuidance?: () => Promise<void> }).applyGmGuidance = async () => {
      applied = true;
    };

    await (s.clearGmGuidance as () => Promise<void>).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints.length,).toBe(0,);
    expect((s._gmGuidance as { turnPriority: Record<string, string> }).turnPriority,).toEqual({},);
    expect(applied,).toBe(true,);
  });
},);

// ── I/O paths: init / loadGmParticipants / applyGmGuidance ─────────────

describeOrSkip("gmGuidance I/O", () => {
  const realAlpine = (globalThis as { Alpine?: unknown }).Alpine;
  afterAll(() => {
    (globalThis as { Alpine?: unknown }).Alpine = realAlpine;
  },);

  /**
   * @param chatId
   */
  function withChat(chatId: string | null,) {
    (globalThis as { Alpine?: unknown }).Alpine = {
      store: () => (chatId ? { currentChat: { id: chatId, }, } : undefined),
    };
  }

  /**
   * @param overrides
   */
  function makeComponent(overrides: Record<string, unknown> = {},) {
    const s = gmGuidance() as Record<string, unknown>;
    s._gmGuidance = { constraints: [], turnPriority: {}, };
    s._gmNewConstraint = "";
    s._storyMode = false;
    s._gmParticipants = [];
    s._gmGuidanceLoading = false;
    Object.assign(s, overrides,);
    return s;
  }

  beforeEach(() => {
    fetchCalls.length = 0;
    fetchHandler = async () => new Response("{}", { status: 200, },);
    withChat("chat-1",);
  },);

  describeOrSkip("init", () => {
    it("does nothing without an active chat", async () => {
      withChat(null,);
      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(fetchCalls.length,).toBe(0,);
    });

    it("loads story mode and guidance from the chat config", async () => {
      fetchHandler = async () =>
        new Response(
          JSON.stringify({
            mode: "story",
            gm_config: JSON.stringify({
              storyMode: true,
              gmGuidance: { constraints: ["c1",], turnPriority: { "a1": "high", }, },
            },),
          },),
          { status: 200, },
        );

      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(s._storyMode,).toBe(true,);
      expect(s._gmGuidance,).toEqual({ constraints: ["c1",], turnPriority: { "a1": "high", }, },);
    });

    it("loads participants only in story mode", async () => {
      fetchHandler = async () =>
        new Response(
          JSON.stringify({
            mode: "story",
            gm_config: "{}",
          },),
          { status: 200, },
        );

      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(fetchCalls.map((c,) => c.url),).toEqual([
        "/api/v1/chats/chat-1",
        "/api/v1/chats/chat-1/participants",
      ],);
    });

    it("skips the participants fetch outside story mode", async () => {
      fetchHandler = async () =>
        new Response(
          JSON.stringify({
            mode: "sketch",
            gm_config: "{}",
          },),
          { status: 200, },
        );

      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(fetchCalls.map((c,) => c.url),).toEqual(["/api/v1/chats/chat-1",],);
    });

    it("falls back to defaults on a missing gm_config", async () => {
      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(s._storyMode,).toBe(false,);
      expect(s._gmGuidance,).toEqual({ constraints: [], turnPriority: {}, },);
    });

    it("falls back to defaults on an invalid gm_config", async () => {
      fetchHandler = async () =>
        new Response(
          JSON.stringify({
            mode: "story",
            gm_config: "{not json",
          },),
          { status: 200, },
        );

      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(s._storyMode,).toBe(false,);
      expect(s._gmGuidance,).toEqual({ constraints: [], turnPriority: {}, },);
    });

    it("keeps defaults on !ok", async () => {
      fetchHandler = async () => new Response("nope", { status: 500, },);
      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(s._storyMode,).toBe(false,);
      expect(s._gmGuidance,).toEqual({ constraints: [], turnPriority: {}, },);
    });

    it("swallows fetch errors", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const s = makeComponent();
      await (s.init as () => Promise<void>).call(s,);
      expect(s._gmGuidance,).toEqual({ constraints: [], turnPriority: {}, },);
    });
  },);

  describeOrSkip("loadGmParticipants", () => {
    it("does nothing without an active chat", async () => {
      withChat(null,);
      const s = makeComponent();
      await (s.loadGmParticipants as () => Promise<void>).call(s,);
      expect(fetchCalls.length,).toBe(0,);
    });

    it("stores the participants on ok", async () => {
      fetchHandler = async () =>
        new Response(
          JSON.stringify([
            { actor_id: "a1", name: "Alice", },
          ],),
          { status: 200, },
        );

      const s = makeComponent();
      await (s.loadGmParticipants as () => Promise<void>).call(s,);
      expect(s._gmParticipants,).toEqual([{ actor_id: "a1", name: "Alice", },],);
    });

    it("keeps the previous list on !ok", async () => {
      fetchHandler = async () => new Response("nope", { status: 500, },);
      const s = makeComponent({ _gmParticipants: [{ actor_id: "old", name: "Old", },], },);
      await (s.loadGmParticipants as () => Promise<void>).call(s,);
      expect(s._gmParticipants,).toEqual([{ actor_id: "old", name: "Old", },],);
    });

    it("swallows fetch errors", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const s = makeComponent();
      await (s.loadGmParticipants as () => Promise<void>).call(s,);
      expect(s._gmParticipants,).toEqual([],);
    });
  },);

  describeOrSkip("applyGmGuidance", () => {
    it("does nothing without an active chat", async () => {
      withChat(null,);
      const s = makeComponent();
      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(fetchCalls.length,).toBe(0,);
      expect(s._gmGuidanceLoading,).toBe(false,);
    });

    it("puts the full state and toasts success on ok", async () => {
      const dispatches: { event: string; detail: unknown }[] = [];
      const s = makeComponent({
        _storyMode: true,
        _gmGuidance: { constraints: ["c1",], turnPriority: { "a1": "high", }, },
        $dispatch: (event: string, detail: unknown,) => {
          dispatches.push({ event, detail, },);
        },
      },);

      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/gm-guidance",);
      expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({
        storyMode: true,
        gmGuidance: { constraints: ["c1",], turnPriority: { "a1": "high", }, },
      },);

      expect(dispatches,).toEqual([
        { event: "show-toast", detail: { type: "success", message: "toasts.gmGuidanceApplied", }, },
      ],);

      expect(s._gmGuidanceLoading,).toBe(false,);
    });

    it("toasts the server error on !ok", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ error: "bad", },), { status: 400, },);
      const dispatches: { event: string; detail: unknown }[] = [];
      const s = makeComponent({
        $dispatch: (event: string, detail: unknown,) => {
          dispatches.push({ event, detail, },);
        },
      },);

      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(dispatches,).toEqual([
        { event: "show-toast", detail: { type: "error", message: "bad", }, },
      ],);
    });

    it("toasts the default error when the body has no error field", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ other: 1, },), { status: 400, },);
      const dispatches: { event: string; detail: unknown }[] = [];
      const s = makeComponent({
        $dispatch: (event: string, detail: unknown,) => {
          dispatches.push({ event, detail, },);
        },
      },);

      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(dispatches,).toEqual([
        { event: "show-toast", detail: { type: "error", message: "toasts.gmGuidanceFailed", }, },
      ],);
    });

    it("toasts a network error when fetch throws", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const dispatches: { event: string; detail: unknown }[] = [];
      const s = makeComponent({
        $dispatch: (event: string, detail: unknown,) => {
          dispatches.push({ event, detail, },);
        },
      },);

      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(dispatches,).toEqual([
        { event: "show-toast", detail: { type: "error", message: "toasts.networkErrorSavingSettings", }, },
      ],);
    });

    it("clears the loading flag even when fetch throws", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const s = makeComponent({ $dispatch: () => {}, },);
      await (s.applyGmGuidance as () => Promise<void>).call(s,);
      expect(s._gmGuidanceLoading,).toBe(false,);
    });
  },);
},);
