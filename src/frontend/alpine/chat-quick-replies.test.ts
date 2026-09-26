import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  AUTO_FIRE_MAX_CONSECUTIVE,
  AUTO_FIRE_MIN_INTERVAL_MS,
  chatQuickReplies,
} from "./chat-quick-replies";

// ── Mock apiFetch (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

/** Minimal shape exercised by the quick-reply methods under test. */
interface QuickReplyCtx {
  activeChat: string;
  chats: { id: string; name: string; quick_replies: string | null }[];
  _quickReplies: { label: string; command: string; trigger?: "startup" | "user" | "ai" }[];
  _quickRepliesDirty: boolean;
  _startupFiredChat: string | null;
  _autoFired: boolean;
  _lastAutoFireAt: number;
  _consecutiveAutoFires: number;
  $refs: { messageInput: { value: string } };
  $dispatch?: (event: string, detail?: unknown,) => void;
  sendMessage: () => Promise<void>;
  loadMessages: () => Promise<void>;
  executeQuickReply: (command: string,) => Promise<void>;
}

/**
 * Build a minimal ChatState-like context for the quick-reply methods.
 * @param overrides
 */
function buildCtx(
  overrides?: Partial<{
    quickReplies: { label: string; command: string; trigger?: "startup" | "user" | "ai" }[];
    sends: string[];
    autoFired: boolean;
    lastAutoFireAt: number;
    consecutiveAutoFires: number;
  }>,
): { ctx: QuickReplyCtx; sends: string[] } {
  const sends: string[] = overrides?.sends ?? [];
  const ctx: QuickReplyCtx = {
    activeChat: "chat-1",
    chats: [{ id: "chat-1", name: "c1", quick_replies: JSON.stringify(overrides?.quickReplies ?? [],), },],
    _quickReplies: overrides?.quickReplies ?? [],
    _quickRepliesDirty: false,
    _startupFiredChat: null,
    _autoFired: overrides?.autoFired ?? false,
    _lastAutoFireAt: overrides?.lastAutoFireAt ?? 0,
    _consecutiveAutoFires: overrides?.consecutiveAutoFires ?? 0,
    $refs: { messageInput: { value: "", }, },
    // Record the command by forwarding through sendMessage to avoid touching
    // the real chat-send module in this unit test.
    sendMessage: async function() {
      if (this._autoFired) { this._consecutiveAutoFires += 1; }
      this._autoFired = false;
      sends.push(this.$refs.messageInput.value,);
    },
    loadMessages: async () => {},
    // Delegate to the module's implementation so fireAutoQuickReplies can
    // dispatch through the real command path against this ctx.
    executeQuickReply: (command: string,) => chatQuickReplies.executeQuickReply!.call(ctx, command,),
  };
  return { ctx, sends, };
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

// ── fireAutoQuickReplies — loop guard + event triggers ──────

describe("chatQuickReplies.fireAutoQuickReplies", () => {
  test("fires user-triggered commands when invoked from a human send", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [
        { label: "greet", command: "/hello", trigger: "user", },
        { label: "plan", command: "/plan", trigger: "user", },
      ],
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "user",);
    expect(sends,).toEqual(["/hello", "/plan",],);
  });

  test("does not fire when an automated send is already in flight", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "user", },],
      autoFired: true,
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "user",);
    expect(sends,).toEqual([],);
  });

  test("respects the min-interval rate limit between automated sends", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "ai", },],
      lastAutoFireAt: Date.now(),
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "ai",);
    expect(sends,).toEqual([],);
  });

  test("allows a second fire after the interval elapses", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "ai", },],
      lastAutoFireAt: Date.now() - AUTO_FIRE_MIN_INTERVAL_MS - 10,
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "ai",);
    expect(sends,).toEqual(["/p",],);
  });

  test("pauses automation at the consecutive cap", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "ai", },],
      consecutiveAutoFires: AUTO_FIRE_MAX_CONSECUTIVE,
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "ai",);
    expect(sends,).toEqual([],);
  });

  test("breaks the ai-trigger loop: after an auto-fire crosses the cap, further ai fires are suppressed", async () => {
    // Simulate an ai-triggered send completing when the cap is nearly reached.
    // One ai event fires its whole command batch; the counter then exceeds
    // the cap, so the next ai event (the feedback iteration) no-ops.
    const { ctx, sends, } = buildCtx({
      quickReplies: [
        { label: "p", command: "/p", trigger: "ai", },
        { label: "q", command: "/q", trigger: "ai", },
      ],
      consecutiveAutoFires: AUTO_FIRE_MAX_CONSECUTIVE - 1,
    },);
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "ai",);
    expect(sends,).toEqual(["/p", "/q",],); // batch runs, counter 4→5→6
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "ai",);
    expect(sends,).toEqual(["/p", "/q",],); // capped — the feedback iteration emits nothing
  });
});

// ── executeQuickReply — marks automated sends ───────────────

describe("chatQuickReplies.executeQuickReply", () => {
  test("sets _autoFired so the produced send does not re-trigger user events", async () => {
    const { ctx, sends, } = buildCtx();
    await chatQuickReplies.executeQuickReply!.call(ctx, "/greet",);
    expect(sends,).toEqual(["/greet",],);
    // The stub sendMessage resets _autoFired to false after the send lands;
    // during the send it was true (verified via the stub's counter branch).
    expect(ctx._consecutiveAutoFires,).toBe(1,);
  });
});

// ── saveQuickReplies — persists the button set ──────────────

describe("chatQuickReplies.saveQuickReplies", () => {
  test("PUTs quickReplies and clears the dirty flag on success", async () => {
    mockFetch(200, { ok: true, },);
    const { ctx, } = buildCtx();
    ctx._quickRepliesDirty = true;
    ctx.$dispatch = () => {};
    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-1",);
    expect(fetchCalls[0]!.opts.method,).toBe("PUT",);
    expect(ctx._quickRepliesDirty,).toBe(false,);
  });

  test("keeps dirty flag on failure", async () => {
    mockFetch(500, { error: "boom", },);
    const { ctx, } = buildCtx();
    ctx._quickRepliesDirty = true;
    ctx.$dispatch = () => {};
    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(ctx._quickRepliesDirty,).toBe(true,);
  });
});
