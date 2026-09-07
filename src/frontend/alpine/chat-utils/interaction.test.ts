import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { chatUtilsInteraction, } from "./interaction";

// ── Mock ../htmx (interaction.ts imports apiFetch from it) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

// Ambient globals used by interaction.ts (bare `window`, `t`, `showToast`).
const g = globalThis as unknown as {
  window?: { innerWidth: number; innerHeight: number };
  t?: (key: string, params?: Record<string, unknown>,) => string;
  showToast?: (type: string, message: string,) => void;
};
const original = { window: g.window, t: g.t, showToast: g.showToast, };
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  g.window = { innerWidth: 1000, innerHeight: 800, };
  g.t = (key,) => key;
  g.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
});

afterEach(() => {
  g.window = original.window;
  g.t = original.t;
  g.showToast = original.showToast;
});

interface InteractionCtx {
  _contextMenu: { visible: boolean; messageId: string | null; x: number; y: number };
  _flagDialog: { open: boolean; contentType: string; contentId: string; chatId: string | null };
  _flagReason: string;
  _flagOther: string;
  _flagBusy: boolean;
  _reactionPicker: { visible: boolean; messageId: string | null; x: number; y: number };
}

/**
 * The production ctx is the full Alpine component: submitFlag calls
 * this.closeFlagDialog(), so the interaction methods must be mixed in.
 */
function buildCtx(overrides?: Partial<InteractionCtx>,): InteractionCtx {
  return {
    ...chatUtilsInteraction,
    _contextMenu: { visible: false, messageId: null, x: 0, y: 0, },
    _flagDialog: { open: false, contentType: "message", contentId: "", chatId: null, },
    _flagReason: "",
    _flagOther: "",
    _flagBusy: false,
    _reactionPicker: { visible: false, messageId: null, x: 0, y: 0, },
    ...overrides,
  } as InteractionCtx;
}

describe("chatUtilsInteraction context menu", () => {
  test("clamps the menu inside the viewport", () => {
    const ctx = buildCtx();
    const event = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 5000,
      clientY: 4000,
    } as unknown as MouseEvent;
    chatUtilsInteraction.openContextMenu!.call(ctx as never, event, "m1",);
    expect(ctx._contextMenu,).toEqual({ visible: true, messageId: "m1", x: 800, y: 500, },);
    chatUtilsInteraction.closeContextMenu!.call(ctx as never,);
    expect(ctx._contextMenu,).toEqual({ visible: false, messageId: null, x: 0, y: 0, },);
  });
});

describe("chatUtilsInteraction flag dialog", () => {
  test("open resets reason fields, close only hides", () => {
    const ctx = buildCtx({ _flagReason: "stale", _flagOther: "junk", },);
    chatUtilsInteraction.openFlagDialog!.call(ctx as never, "asset", "a1", "chat-1",);
    expect(ctx._flagDialog,).toEqual({ open: true, contentType: "asset", contentId: "a1", chatId: "chat-1", },);
    expect(ctx._flagReason,).toBe("",);
    expect(ctx._flagOther,).toBe("",);
    chatUtilsInteraction.closeFlagDialog!.call(ctx as never,);
    expect(ctx._flagDialog.open,).toBe(false,);
  });

  test("submit skips without a content id", async () => {
    const ctx = buildCtx();
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx._flagBusy,).toBe(false,);
  });

  test("submit refuses a blank reason and does not hit the API", async () => {
    const ctx = buildCtx({ _flagDialog: { open: true, contentType: "message", contentId: "m1", chatId: null, }, },);
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(toasts,).toEqual([{ type: "error", message: "chats.flagReasonRequired", },],);
    expect(calls,).toEqual([],);
  });

  test("posts the flag with the chosen reason and closes on success", async () => {
    const ctx = buildCtx({
      _flagDialog: { open: true, contentType: "message", contentId: "m1", chatId: "chat-1", },
      _flagReason: "spam",
    },);
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/nsfw/moderation/flags",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({
      contentType: "message",
      contentId: "m1",
      chatId: "chat-1",
      flagReason: "spam",
    },);
    expect(toasts,).toEqual([{ type: "success", message: "chats.flagSubmitted", },],);
    expect(ctx._flagDialog.open,).toBe(false,);
    expect(ctx._flagBusy,).toBe(false,);
  });

  test("an 'other' reason falls back to the trimmed free-text field", async () => {
    const ctx = buildCtx({
      _flagDialog: { open: true, contentType: "asset", contentId: "a1", chatId: null, },
      _flagReason: "other",
      _flagOther: "  too spicy  ",
    },);
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(calls,).toHaveLength(1,);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as Record<string, unknown>;
    expect(body.flagReason,).toBe("too spicy",);
    expect("chatId" in body,).toBe(false,);
  });

  test("surfaces the server-provided error message", async () => {
    const ctx = buildCtx({
      _flagDialog: { open: true, contentType: "message", contentId: "m1", chatId: null, },
      _flagReason: "spam",
    },);
    handler = async () => Response.json({ message: "flag rejected", }, { status: 400, },);
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(toasts,).toEqual([{ type: "error", message: "flag rejected", },],);
    expect(ctx._flagBusy,).toBe(false,);
  });

  test("falls back when the error body is not JSON and on network errors", async () => {
    const ctx = buildCtx({
      _flagDialog: { open: true, contentType: "message", contentId: "m1", chatId: null, },
      _flagReason: "spam",
    },);
    handler = async () => new Response("not-json", { status: 500, },);
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(toasts,).toEqual([{ type: "error", message: "chats.flagFailed", },],);
    handler = async () => {
      throw new Error("offline",);
    };
    await chatUtilsInteraction.submitFlag!.call(ctx as never,);
    expect(toasts,).toHaveLength(2,);
    expect(toasts[1]!.message,).toBe("chats.flagFailed",);
    expect(ctx._flagBusy,).toBe(false,);
  });
});

describe("chatUtilsInteraction reaction picker", () => {
  test("positions the picker above the target and clamps to the viewport", () => {
    const ctx = buildCtx();
    const event = {
      target: { getBoundingClientRect: () => ({ left: 900, top: 5, }), },
    } as unknown as Event;
    chatUtilsInteraction.showReactionPicker!.call(ctx as never, "m1", event,);
    expect(ctx._reactionPicker,).toEqual({ visible: true, messageId: "m1", x: 760, y: 8, },);
    chatUtilsInteraction.closeReactionPicker!.call(ctx as never,);
    expect(ctx._reactionPicker.visible,).toBe(false,);
  });
});

describe("chatUtilsInteraction.displayName", () => {
  test("maps roles to stable labels", () => {
    const ctx = {} as never;
    expect(chatUtilsInteraction.displayName!.call(ctx, { role: "user", },),).toBe("You",);
    expect(chatUtilsInteraction.displayName!.call(ctx, { role: "system", },),).toBe("System",);
    expect(chatUtilsInteraction.displayName!.call(ctx, { role: "narration", },),).toBe("Narrator",);
    expect(chatUtilsInteraction.displayName!.call(ctx, { role: "assistant", actor_name: "Lyra", },),).toBe("Lyra",);
    expect(chatUtilsInteraction.displayName!.call(ctx, { role: "assistant", actor_id: "a1", },),).toBe("Assistant",);
  });
});
