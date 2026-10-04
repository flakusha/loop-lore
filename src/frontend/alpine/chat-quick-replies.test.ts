import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  AUTO_FIRE_MAX_CONSECUTIVE,
  AUTO_FIRE_MIN_INTERVAL_MS,
  chatQuickReplies,
} from "./chat-quick-replies";

// ── Mock apiFetch (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

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

describeOrSkip("chatQuickReplies.fireAutoQuickReplies", () => {
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
},);

// ── executeQuickReply — marks automated sends ───────────────

describeOrSkip("chatQuickReplies.executeQuickReply", () => {
  test("sets _autoFired so the produced send does not re-trigger user events", async () => {
    const { ctx, sends, } = buildCtx();
    await chatQuickReplies.executeQuickReply!.call(ctx, "/greet",);
    expect(sends,).toEqual(["/greet",],);
    // The stub sendMessage resets _autoFired to false after the send lands;
    // during the send it was true (verified via the stub's counter branch).
    expect(ctx._consecutiveAutoFires,).toBe(1,);
  });
},);

// ── saveQuickReplies — persists the button set ──────────────

describeOrSkip("chatQuickReplies.saveQuickReplies", () => {
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
},);

// ── loadQuickReplies — parse the active chat's button set ──

describeOrSkip("chatQuickReplies.loadQuickReplies", () => {
  test("parses the active chat's quick_replies JSON into state", () => {
    const { ctx, } = buildCtx({ quickReplies: [{ label: "greet", command: "/hello", },], },);
    chatQuickReplies.loadQuickReplies!.call(ctx,);
    expect(ctx._quickReplies,).toEqual([{ label: "greet", command: "/hello", },],);
  });

  test("falls back to [] when quick_replies is null", () => {
    const { ctx, } = buildCtx();
    ctx.chats[0]!.quick_replies = null;
    chatQuickReplies.loadQuickReplies!.call(ctx,);
    expect(ctx._quickReplies,).toEqual([],);
  });

  test("falls back to [] when the chat is not in the list", () => {
    const { ctx, } = buildCtx({ quickReplies: [{ label: "g", command: "/g", },], },);
    ctx.activeChat = "missing";
    chatQuickReplies.loadQuickReplies!.call(ctx,);
    expect(ctx._quickReplies,).toEqual([],);
  });

  test("falls back to [] when the JSON is corrupt", () => {
    const { ctx, } = buildCtx();
    ctx.chats[0]!.quick_replies = "{not json";
    chatQuickReplies.loadQuickReplies!.call(ctx,);
    expect(ctx._quickReplies,).toEqual([],);
  });
},);

// ── executeQuickReply — guard edges ──────────────────────────

describeOrSkip("chatQuickReplies.executeQuickReply — guards", () => {
  test("ignores an empty command", async () => {
    const { ctx, sends, } = buildCtx();
    await chatQuickReplies.executeQuickReply!.call(ctx, "",);
    expect(sends,).toEqual([],);
  });

  test("ignores the call when there is no active chat", async () => {
    const { ctx, sends, } = buildCtx();
    ctx.activeChat = "";
    await chatQuickReplies.executeQuickReply!.call(ctx, "/greet",);
    expect(sends,).toEqual([],);
  });

  test("still sends when $refs is undefined", async () => {
    const { ctx, sends, } = buildCtx();
    ctx.$refs = undefined as unknown as QuickReplyCtx["$refs"];
    // The shared stub reads $refs.messageInput; this test needs a $refs-free send.
    ctx.sendMessage = async function() {
      sends.push("/greet",);
    };

    await chatQuickReplies.executeQuickReply!.call(ctx, "/greet",);
    expect(sends,).toEqual(["/greet",],);
  });
},);

// ── fireStartupQuickReplies — once-per-chat startup batch ────

describeOrSkip("chatQuickReplies.fireStartupQuickReplies", () => {
  test("runs startup commands once per chat open", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "s", command: "/start", trigger: "startup", },],
    },);

    await chatQuickReplies.fireStartupQuickReplies!.call(ctx,);
    expect(sends,).toEqual(["/start",],);
    expect(ctx._startupFiredChat,).toBe("chat-1",);
    await chatQuickReplies.fireStartupQuickReplies!.call(ctx,);
    expect(sends,).toEqual(["/start",],); // already fired for this chat
  });

  test("skips non-startup triggers and empty commands", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [
        { label: "u", command: "/u", trigger: "user", },
        { label: "e", command: "", trigger: "startup", },
      ],
    },);

    await chatQuickReplies.fireStartupQuickReplies!.call(ctx,);
    expect(sends,).toEqual([],);
  });

  test("no-ops without an active chat", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "s", command: "/start", trigger: "startup", },],
    },);

    ctx.activeChat = "";
    await chatQuickReplies.fireStartupQuickReplies!.call(ctx,);
    expect(sends,).toEqual([],);
    expect(ctx._startupFiredChat,).toBeNull();
  });
},);

// ── fireAutoQuickReplies — remaining guard edges ────────────

describeOrSkip("chatQuickReplies.fireAutoQuickReplies — guards", () => {
  test("no-ops without an active chat", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "user", },],
    },);

    ctx.activeChat = "";
    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "user",);
    expect(sends,).toEqual([],);
  });

  test("sends nothing when no quick reply matches the trigger", async () => {
    const { ctx, sends, } = buildCtx({
      quickReplies: [{ label: "p", command: "/p", trigger: "ai", },],
    },);

    await chatQuickReplies.fireAutoQuickReplies!.call(ctx, "user",);
    expect(sends,).toEqual([],);
  });
},);

// ── saveQuickReplies — dirty guard, null body, toasts ────────

describeOrSkip("chatQuickReplies.saveQuickReplies — edges", () => {
  test("no-ops when the set is not dirty", async () => {
    const { ctx, } = buildCtx();
    ctx.$dispatch = () => {};
    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(fetchCalls,).toEqual([],);
  });

  test("no-ops without an active chat", async () => {
    const { ctx, } = buildCtx();
    ctx._quickRepliesDirty = true;
    ctx.activeChat = "";
    ctx.$dispatch = () => {};
    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(fetchCalls,).toEqual([],);
  });

  test("PUTs null quickReplies when the list is empty", async () => {
    mockFetch(200, { ok: true, },);
    const { ctx, } = buildCtx();
    ctx._quickRepliesDirty = true;
    ctx.$dispatch = () => {};
    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    const body = JSON.parse(fetchCalls[0]!.opts.body as string,) as { quickReplies: unknown };
    expect(body.quickReplies,).toBeNull();
  });

  test("updates the chat column and dispatches a success toast", async () => {
    mockFetch(200, { ok: true, },);
    const { ctx, } = buildCtx({ quickReplies: [{ label: "greet", command: "/hello", },], },);
    ctx._quickRepliesDirty = true;
    const toasts: { event: string; detail?: unknown }[] = [];
    ctx.$dispatch = (event: string, detail?: unknown,) => {
      toasts.push({ event, detail, },);
    };

    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(ctx.chats[0]!.quick_replies,).toBe(JSON.stringify([{ label: "greet", command: "/hello", },],),);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.event,).toBe("show-toast",);
    expect((toasts[0]!.detail as { type: string }).type,).toBe("success",);
  });

  test("dispatches an error toast on failure", async () => {
    mockFetch(500, { error: "boom", },);
    const { ctx, } = buildCtx({ quickReplies: [{ label: "greet", command: "/hello", },], },);
    ctx._quickRepliesDirty = true;
    const toasts: { event: string; detail?: unknown }[] = [];
    ctx.$dispatch = (event: string, detail?: unknown,) => {
      toasts.push({ event, detail, },);
    };

    await chatQuickReplies.saveQuickReplies!.call(ctx,);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.event,).toBe("show-toast",);
    expect((toasts[0]!.detail as { type: string }).type,).toBe("error",);
  });
},);
