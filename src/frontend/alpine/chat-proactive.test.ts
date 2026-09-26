import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatProactive, } from "./chat-proactive";

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
 * Queue endpoint responses: each handler consumes configs then check then send.
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

interface ProactiveCtx {
  activeChat: string | null;
  _proactiveTimer: ReturnType<typeof setInterval> | null;
  _proactiveInFlight: boolean;
  _proactiveLastSendAt: number;
  startProactiveScheduler(): void;
  stopProactiveScheduler(): void;
  tickProactive(): Promise<void>;
}

/**
 * @param overrides
 * @param overrides.activeChat
 * @param overrides.inFlight
 * @param overrides.lastSendAt
 */
function buildCtx(overrides: {
  activeChat?: string | null;
  inFlight?: boolean;
  lastSendAt?: number;
} = {},): ProactiveCtx {
  // undefined -> default chat id; explicit null -> "no chat active"; string -> that chat.
  const activeChat = overrides.activeChat === undefined ? "chat-1" : overrides.activeChat;
  const ctx: ProactiveCtx = {
    activeChat,
    _proactiveTimer: null,
    _proactiveInFlight: overrides.inFlight ?? false,
    _proactiveLastSendAt: overrides.lastSendAt ?? 0,
    // Placeholders — replaced by the bound real methods below.
    startProactiveScheduler: () => {},
    stopProactiveScheduler: () => {},
    tickProactive: async () => {},
  };
  ctx.startProactiveScheduler = chatProactive.startProactiveScheduler!.bind(ctx,);
  ctx.stopProactiveScheduler = chatProactive.stopProactiveScheduler!.bind(ctx,);
  ctx.tickProactive = chatProactive.tickProactive!.bind(ctx,);
  return ctx;
}

describe("chatProactive — scheduler", () => {
  afterEach(() => {
    fetchCalls = [];
    fetchHandler = null;
  },);

  test("tickProactive sends when an enabled config is due", async () => {
    const configs = [{ actorId: "a1", enabled: true, },];
    const due = { shouldMessage: true, };
    // configs -> check -> send
    const responses = [
      Response.json(configs, { status: 200, },),
      Response.json(due, { status: 200, },),
      Response.json({ triggered: true, }, { status: 200, },),
    ];
    let i = 0;
    fetchHandler = () => responses[Math.min(i++,)] ?? new Response("{}", { status: 200, },);
    const ctx = buildCtx();

    await ctx.tickProactive();

    expect(fetchCalls.some((c,) => c.url.includes("/configs?chatId=chat-1",)),).toBe(true,);
    expect(fetchCalls.some((c,) => c.url.includes("/check?chatId=chat-1&actorId=a1",)),).toBe(true,);
    expect(fetchCalls.some((c,) => c.url.includes("/send?chatId=chat-1&actorId=a1",)),).toBe(true,);
    const send = fetchCalls.find((c,) => c.url.includes("/send",));
    expect(send?.opts.method,).toBe("POST",);
  });

  test("tickProactive does not send when check says not due", async () => {
    const configs = [{ actorId: "a1", enabled: true, },];
    const notDue = { shouldMessage: false, };
    const responses = [
      Response.json(configs, { status: 200, },),
      Response.json(notDue, { status: 200, },),
    ];
    let i = 0;
    fetchHandler = () => responses[Math.min(i++,)] ?? new Response("{}", { status: 200, },);
    const ctx = buildCtx();

    await ctx.tickProactive();

    expect(fetchCalls.some((c,) => c.url.includes("/send",)),).toBe(false,);
  });

  test("tickProactive skips disabled configs", async () => {
    const configs = [{ actorId: "a1", enabled: false, },];
    mockFetch(200, configs,);
    const ctx = buildCtx();

    await ctx.tickProactive();

    // Only the configs fetch happened; no per-actor check/send.
    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls.some((c,) => c.url.includes("/check",)),).toBe(false,);
  });

  test("tickProactive does nothing when no chat is active", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await ctx.tickProactive();
    expect(fetchCalls.length,).toBe(0,);
  });

  test("tickProactive returns early while a send is already in flight", async () => {
    const ctx = buildCtx({ inFlight: true, },);
    await ctx.tickProactive();
    expect(fetchCalls.length,).toBe(0,);
  });
});
