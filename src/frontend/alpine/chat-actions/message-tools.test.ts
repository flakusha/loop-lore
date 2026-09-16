import { afterEach, describe, expect, mock, test, } from "bun:test";
import { messageTools, } from "./message-tools";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

// ── Mock ../htmx (must precede importing ./message-tools) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface ToolsCtx {
  activeChat: string | null;
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<ToolsCtx>,): ToolsCtx {
  const ctx: ToolsCtx = {
    activeChat: "chat-1",
    toasts: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  };
  return ctx;
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describe("messageTools.forwardMessage", () => {
  test("warns when there is no active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await messageTools.forwardMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: expect.any(String,), },],);
    expect(calls,).toEqual([],);
  });

  test("no-ops when the target prompt is cancelled", async () => {
    const ctx = buildCtx();
    const orig = globalThis.prompt;
    (globalThis as Record<string, unknown>).prompt = () => null;
    try {
      await messageTools.forwardMessage!.call(ctx as never, "m1",);
    } finally {
      (globalThis as Record<string, unknown>).prompt = orig;
    }
    expect(calls,).toEqual([],);
  });

  test("POSTs target chat and toasts success", async () => {
    const ctx = buildCtx();
    const orig = globalThis.prompt;
    (globalThis as Record<string, unknown>).prompt = () => "chat-2";
    handler = async () => Response.json({ id: "m2", droppedAttachments: 0, }, { status: 201, },);
    try {
      await messageTools.forwardMessage!.call(ctx as never, "m1",);
    } finally {
      (globalThis as Record<string, unknown>).prompt = orig;
    }
    expect(calls[0]?.url,).toBe("/api/chats/chat-1/messages/m1/forward",);
    expect(calls[0]?.opts.method,).toBe("POST",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ targetChatId: "chat-2", },);
    expect(ctx.toasts[0]?.type,).toBe("success",);
  });

  test("400 surfaces the empty-forward warning", async () => {
    const ctx = buildCtx();
    const orig = globalThis.prompt;
    (globalThis as Record<string, unknown>).prompt = () => "chat-2";
    handler = async () => Response.json({ message: "empty", }, { status: 400, },);
    try {
      await messageTools.forwardMessage!.call(ctx as never, "m1",);
    } finally {
      (globalThis as Record<string, unknown>).prompt = orig;
    }
    expect(ctx.toasts[0]?.type,).toBe("warning",);
  });
});

describe("messageTools.runMessageAiAction", () => {
  test("warns when there is no active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await messageTools.runMessageAiAction!.call(ctx as never, "m1", "summarize",);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: expect.any(String,), },],);
    expect(calls,).toEqual([],);
  });

  test("POSTs the action and toasts the result", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ action: "summarize", result: "Key points", },);
    await messageTools.runMessageAiAction!.call(ctx as never, "m1", "summarize",);
    expect(calls[0]?.url,).toBe("/api/chats/chat-1/messages/m1/ai-action",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ action: "summarize", },);
    expect(ctx.toasts[0],).toMatchObject({ type: "info", message: "Key points", },);
  });

  test("503 surfaces the unavailable notice", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "no model", }, { status: 503, },);
    await messageTools.runMessageAiAction!.call(ctx as never, "m1", "explain",);
    expect(ctx.toasts[0]?.type,).toBe("info",);
  });
});
