import { afterEach, describe, expect, mock, test, } from "bun:test";
import { media, } from "./media";

// ── Mock ../htmx (must precede importing ./media) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface Toast {
  type: string;
  message: string;
}

interface MediaMsg {
  id: string;
  content?: string;
  attachments?: { type: string; assetId: string }[];
}

interface MediaCtx {
  activeChat: string | null;
  messages: MediaMsg[];
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<MediaCtx>,): MediaCtx {
  const ctx: MediaCtx = {
    activeChat: "chat-1",
    messages: [],
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

describe("media.generateImageFromMessage", () => {
  test("warns when there is no active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: expect.any(String,), },],);
    expect(calls,).toEqual([],);
  });

  test("warns when the message has no usable content", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "", },], },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
    expect(calls,).toEqual([],);
  });

  test("POSTs a truncated prompt and toasts on success", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "x".repeat(600,), },], },);
    handler = async () => Response.json({ ok: true, },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(calls[0]!.url,).toBe("/api/generation/image",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as { prompt: string; chatId: string; messageId: string };
    expect(body.prompt,).toHaveLength(500,);
    expect(body.chatId,).toBe("chat-1",);
    expect(body.messageId,).toBe("m1",);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("reports unconfigured generation on 501", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "paint", },], },);
    handler = async () => new Response("", { status: 501, },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("info",);
    expect(ctx.toasts,).toHaveLength(1,);
  });

  test("shows the server error on other failures", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "paint", },], },);
    handler = async () => Response.json({ error: "gpu busy", }, { status: 500, },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "gpu busy", },],);
  });

  test("falls back to a generic message when the failure body is opaque", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "paint", },], },);
    handler = async () => Response.json({}, { status: 500, },);
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("error",);
  });

  test("network failures produce an error toast", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", content: "paint", },], },);
    handler = async () => {
      throw new Error("offline",);
    };
    await media.generateImageFromMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("error",);
  });
});

describe("media.captionMessage", () => {
  test("does nothing when the message does not exist", async () => {
    const ctx = buildCtx();
    await media.captionMessage!.call(ctx as never, "missing",);
    expect(ctx.toasts,).toEqual([],);
    expect(calls,).toEqual([],);
  });

  test("warns when there are no image attachments", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", attachments: [{ type: "file", assetId: "a", },], },], },);
    await media.captionMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
    expect(calls,).toEqual([],);
  });

  test("POSTs the image asset ids on success", async () => {
    const ctx = buildCtx({
      messages: [{
        id: "m1",
        attachments: [
          { type: "image", assetId: "img-1", },
          { type: "file", assetId: "doc-1", },
          { type: "image", assetId: "img-2", },
        ],
      },],
    },);
    handler = async () => Response.json({ ok: true, },);
    await media.captionMessage!.call(ctx as never, "m1",);
    expect(calls[0]!.url,).toBe("/api/generation/caption",);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as { assetIds: string[]; chatId: string };
    expect(body.assetIds,).toEqual(["img-1", "img-2",],);
    expect(body.chatId,).toBe("chat-1",);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("reports unconfigured captioning on 501", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", attachments: [{ type: "image", assetId: "i", },], },], },);
    handler = async () => new Response("", { status: 501, },);
    await media.captionMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toHaveLength(1,);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("shows an error toast on other failures and network errors", async () => {
    const ctx = buildCtx({ messages: [{ id: "m1", attachments: [{ type: "image", assetId: "i", },], },], },);
    handler = async () => Response.json({}, { status: 500, },);
    await media.captionMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts[0]!.type,).toBe("error",);
    handler = async () => {
      throw new Error("offline",);
    };
    await media.captionMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toHaveLength(2,);
    expect(ctx.toasts[1]!.type,).toBe("error",);
  });
});
