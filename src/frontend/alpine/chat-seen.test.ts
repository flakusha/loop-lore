import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { chatSeenMethods, } from "./chat-seen";
import type { Message, } from "./types";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = globalState.apiFetch;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

beforeEach(() => {
  // chat-seen reads the ambient `apiFetch` global installed by htmx.ts.
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
},);

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
  globalState.apiFetch = originalFetch;
},);

interface SeenStateRow {
  actorId: string;
  state: string;
  seenAt: string | null;
}

interface SeenCtx {
  activeChat: string | null;
  currentActorId: string | null;
  loadingMessages: boolean;
  messages: (Message & { seenState?: SeenStateRow[] })[];
  _seenPollTimer: ReturnType<typeof setInterval> | null;
  _seenPopoverOpen: boolean;
  _seenPopoverX: number;
  _seenPopoverY: number;
  _seenPopoverViewers: SeenStateRow[];
  dispatched: { event: string; detail: unknown }[];
  $dispatch: (event: string, detail?: unknown,) => void;
  loadMessageSeen: (msgId: string,) => Promise<void>;
}

function buildCtx(overrides?: Partial<SeenCtx>,): SeenCtx {
  const ctx: SeenCtx = {
    activeChat: "chat-1",
    currentActorId: "me-1",
    loadingMessages: false,
    messages: [],
    _seenPollTimer: null,
    _seenPopoverOpen: false,
    _seenPopoverX: 0,
    _seenPopoverY: 0,
    _seenPopoverViewers: [],
    dispatched: [],
    $dispatch: (event, detail,) => {
      ctx.dispatched.push({ event, detail, },);
    },
    // Route through the module so loadAllSeen/markSeen exercise the real fetch path.
    loadMessageSeen: (msgId,) => chatSeenMethods.loadMessageSeen!.call(ctx, msgId,),
    ...overrides,
  };
  return ctx;
}

// The popover handler only reads `currentTarget` — a plain stand-in is enough.
const fakeTarget = { currentTarget: { getBoundingClientRect: () => ({ left: 12, bottom: 34, }), }, };
const fakeEvent = fakeTarget as unknown as Event; // structurally sufficient for openSeenPopover

describe("chatSeenMethods.loadMessageSeen", () => {
  test("attaches the viewer list to the matching message", async () => {
    const viewers: SeenStateRow[] = [{ actorId: "a", state: "seen", seenAt: null, },];
    const ctx = buildCtx({
      messages: [{ id: "m1", role: "user", content: "hi", created_at: "2026-01-01T00:00:00.000Z", },],
    },);
    handler = async () => Response.json(viewers,);
    await chatSeenMethods.loadMessageSeen!.call(ctx, "m1",);
    expect(calls[0]!.url,).toBe("/api/messages/m1/seen",);
    expect(ctx.messages[0]!.seenState,).toEqual(viewers,);
  });

  test("ignores non-ok responses and network failures", async () => {
    const ctx = buildCtx({
      messages: [{ id: "m1", role: "user", content: "hi", created_at: "2026-01-01T00:00:00.000Z", },],
    },);
    handler = async () => new Response("", { status: 500, },);
    await chatSeenMethods.loadMessageSeen!.call(ctx, "m1",);
    expect(ctx.messages[0]!.seenState,).toBeUndefined();
    handler = async () => {
      throw new Error("offline",);
    };
    await chatSeenMethods.loadMessageSeen!.call(ctx, "m1",);
  });

  test("does nothing visible when the message id is unknown", async () => {
    const ctx = buildCtx();
    await chatSeenMethods.loadMessageSeen!.call(ctx, "ghost",);
    expect(calls,).toHaveLength(1,); // fetch still made, result simply unused
  });
});

describe("chatSeenMethods.loadAllSeen", () => {
  test("fetches seen state for every message", async () => {
    const ctx = buildCtx({
      messages: [
        { id: "m1", role: "user", content: "", created_at: "2026-01-01T00:00:00.000Z", },
        { id: "m2", role: "assistant", content: "", created_at: "2026-01-01T00:00:00.000Z", },
      ],
    },);
    await chatSeenMethods.loadAllSeen!.call(ctx,);
    expect(calls.map((c,) => c.url).sort(),).toEqual(["/api/messages/m1/seen", "/api/messages/m2/seen",],);
  });

  test("skips when there is no chat or no messages", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatSeenMethods.loadAllSeen!.call(ctx,);
    expect(calls,).toEqual([],);
    const empty = buildCtx();
    await chatSeenMethods.loadAllSeen!.call(empty,);
    expect(calls,).toEqual([],);
  });
});

describe("chatSeenMethods.markSeen", () => {
  test("POSTs the seen state and reloads viewers on success", async () => {
    const viewers: SeenStateRow[] = [{ actorId: "me-1", state: "seen", seenAt: null, },];
    const ctx = buildCtx({
      messages: [{ id: "m1", role: "user", content: "", created_at: "2026-01-01T00:00:00.000Z", },],
    },);
    handler = async (_url, opts,) => opts?.method === "POST" ? Response.json({},) : Response.json(viewers,);
    await chatSeenMethods.markSeen!.call(ctx, "m1", "seen",);
    const post = calls.find((c,) => c.opts.method === "POST")!;
    expect(post.url,).toBe("/api/messages/m1/seen",);
    expect(JSON.parse(String(post.opts.body,),),).toEqual({ actorId: "me-1", state: "seen", },);
    expect(ctx.messages[0]!.seenState,).toEqual(viewers,);
  });

  test("supports the processing state and skips non-ok responses", async () => {
    const ctx = buildCtx();
    handler = async () => new Response("", { status: 500, },);
    await chatSeenMethods.markSeen!.call(ctx, "m1", "processing",);
    const post = calls.find((c,) => c.opts.method === "POST")!;
    expect(JSON.parse(String(post.opts.body,),),).toEqual({ actorId: "me-1", state: "processing", },);
    expect(calls,).toHaveLength(1,);
  });

  test("swallows network failures and requires an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatSeenMethods.markSeen!.call(ctx, "m1", "seen",);
    expect(calls,).toEqual([],);
    handler = async () => {
      throw new Error("offline",);
    };
    await chatSeenMethods.markSeen!.call(buildCtx(), "m1", "seen",);
  });
});

describe("chatSeenMethods popover + summary", () => {
  test("openSeenPopover dispatches with viewers and target coordinates", () => {
    const ctx = buildCtx({
      messages: [{
        id: "m1",
        role: "assistant",
        content: "",
        created_at: "2026-01-01T00:00:00.000Z",
        seenState: [{ actorId: "a", state: "seen", seenAt: null, },],
      },],
    },);
    chatSeenMethods.openSeenPopover!.call(ctx, "m1", fakeEvent,);
    expect(ctx.dispatched,).toHaveLength(1,);
    expect(ctx.dispatched[0]!.event,).toBe("show-seen-popover",);
    const detail = ctx.dispatched[0]!.detail as { messageId: string; target: unknown };
    expect(detail.messageId,).toBe("m1",);
    expect(detail.target,).toBe(fakeTarget.currentTarget,);
  });

  test("openSeenPopover ignores unknown messages and empty seen state", () => {
    const ctx = buildCtx({
      messages: [{ id: "m1", role: "assistant", content: "", created_at: "2026-01-01T00:00:00.000Z", },],
    },);
    chatSeenMethods.openSeenPopover!.call(ctx, "ghost", fakeEvent,);
    chatSeenMethods.openSeenPopover!.call(ctx, "m1", fakeEvent,);
    expect(ctx.dispatched,).toEqual([],);
  });

  test("seenTitle summarizes seen and processing counts", () => {
    expect(chatSeenMethods.seenTitle!.call({} as never, [
      { actorId: "a", state: "seen", seenAt: null, },
      { actorId: "b", state: "seen", seenAt: null, },
      { actorId: "c", state: "processing", seenAt: null, },
    ],),).toBe("2 seen, 1 processing",);
    expect(chatSeenMethods.seenTitle!.call({} as never, [
      { actorId: "c", state: "processing", seenAt: null, },
    ],),).toBe("1 processing",);
    expect(chatSeenMethods.seenTitle!.call({} as never, [],),).toBe("No viewers",);
  });

  test("seenCount returns the row count", () => {
    expect(chatSeenMethods.seenCount!.call({} as never, [
      { actorId: "a", state: "seen", seenAt: null, },
      { actorId: "b", state: "processing", seenAt: null, },
    ],),).toBe(2,);
    expect(chatSeenMethods.seenCount!.call({} as never, [],),).toBe(0,);
  });
});

describe("chatSeenMethods polling", () => {
  test("startSeenPolling is idempotent and stopSeenPolling clears the timer", () => {
    const ctx = buildCtx();
    chatSeenMethods.startSeenPolling!.call(ctx,);
    const first = ctx._seenPollTimer;
    expect(first,).not.toBeNull();
    chatSeenMethods.startSeenPolling!.call(ctx,);
    expect(ctx._seenPollTimer,).toBe(first,);
    chatSeenMethods.stopSeenPolling!.call(ctx,);
    expect(ctx._seenPollTimer,).toBeNull();
    // Stopping twice is safe.
    chatSeenMethods.stopSeenPolling!.call(ctx,);
  });
});

describe("chatSeenMethods.initSeenPopover", () => {
  test("registers a listener that positions and opens the popover", () => {
    const doc = globalThis as unknown as {
      document: { addEventListener: (t: string, cb: (e: unknown,) => void,) => void };
    };
    const original = doc.document.addEventListener;
    let captured: ((e: unknown,) => void) | null = null;
    doc.document.addEventListener = (_type, cb,) => {
      captured = cb;
    };
    try {
      const ctx = buildCtx();
      chatSeenMethods.initSeenPopover!.call(ctx,);
      expect(captured,).not.toBeNull();
      // With a measurable target: X from left, Y from bottom + 8px offset.
      captured!({
        detail: {
          viewers: [{ actorId: "a", state: "seen", seenAt: null, },],
          target: { getBoundingClientRect: () => ({ left: 12, bottom: 34, }), },
        },
      },);
      expect(ctx._seenPopoverOpen,).toBe(true,);
      expect(ctx._seenPopoverX,).toBe(12,);
      expect(ctx._seenPopoverY,).toBe(42,);
      expect(ctx._seenPopoverViewers,).toEqual([{ actorId: "a", state: "seen", seenAt: null, },],);
      // Without a measurable target the coordinates fall back to 0 / 8.
      chatSeenMethods.initSeenPopover!.call(ctx,);
      captured!({ detail: { viewers: [], target: {}, }, },);
      expect(ctx._seenPopoverX,).toBe(0,);
      expect(ctx._seenPopoverY,).toBe(8,);
      expect(ctx._seenPopoverViewers,).toEqual([],);
    } finally {
      doc.document.addEventListener = original;
    }
  });
});
