import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { chatSendMethods, } from "./chat-send";
import type { Message, } from "./types";

// NOTE: the real ../browser module is used (no mock.module — bun's module
// patches leak across files in one process and broke sibling tests).

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = globalState.apiFetch;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

beforeEach(() => {
  // chat-send reads the ambient `apiFetch` global installed by htmx.ts.
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
});
afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = originalFetch;
});
afterAll(() => {
  globalState.apiFetch = originalFetch;
});

interface Toast { type: string; message: string }

interface SendCtx {
  activeChat: string | null;
  messages: (Message & { id: string })[];
  pendingAssets: { assetId: string; filename: string }[];
  isGenerating: boolean;
  _autoFired: boolean;
  _consecutiveAutoFires: number;
  _encryptionEnabled: boolean;
  _chatKey: CryptoKey | null;
  _keyId: string | null;
  $refs: { messageInput: { value: string } };
  autoResize: (el: unknown,) => void;
  scrollToBottom: () => void;
  loadMessages: () => Promise<void>;
  loadChats: () => Promise<void>;
  connectGenerationSSE: (chatId: string | null,) => void;
  dispatchCommandAction: (action: string, payload: unknown, chatId: string | null,) => Promise<void>;
  fireAutoQuickReplies: (trigger: "user" | "ai",) => Promise<void>;
  toasts: Toast[];
  dispatched: { event: string; detail: unknown }[];
  $dispatch: (event: string, detail?: unknown,) => void;
  $nextTick: (fn: () => void,) => void;
}

function buildCtx(overrides?: Partial<SendCtx>,): SendCtx {
  const ctx: SendCtx = {
    activeChat: "chat-1",
    messages: [],
    pendingAssets: [],
    isGenerating: false,
    _autoFired: false,
    _consecutiveAutoFires: 0,
    _encryptionEnabled: false,
    _chatKey: null,
    _keyId: null,
    $refs: { messageInput: { value: "" }, },
    autoResize: () => {},
    scrollToBottom: () => {},
    loadMessages: async () => {},
    loadChats: async () => {},
    connectGenerationSSE: () => {},
    dispatchCommandAction: async () => {},
    fireAutoQuickReplies: async () => {},
    toasts: [],
    dispatched: [],
    $dispatch: (event, detail,) => {
      ctx.dispatched.push({ event, detail, },);
      if (event === "show-toast") { ctx.toasts.push(detail as Toast,); }
    },
    $nextTick: (fn,) => fn(),
    ...overrides,
  };
  return ctx;
}

function postBody(): Record<string, unknown> {
  const post = calls.find((c,) => c.opts.method === "POST",)!;
  return JSON.parse(String(post.opts.body,),) as Record<string, unknown>;
}

describe("chatSendMethods.sendMessage — guards", () => {
  test("does nothing when the input is empty and no assets are pending", async () => {
    const ctx = buildCtx();
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx.messages,).toEqual([],);
  });

  test("trims whitespace-only input into a no-op", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "   ";
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(calls,).toEqual([],);
  });

  test("warns when there is no active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    ctx.$refs.messageInput.value = "hello";
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
    expect(calls,).toEqual([],);
  });
});

describe("chatSendMethods.sendMessage — success paths", () => {
  test("posts plain content, clears the input and appends an optimistic temp message", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "  hello  ";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    const body = postBody();
    expect(body.content,).toBe("hello",);
    expect(calls[0]!.url,).toBe("/api/chats/chat-1/messages",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(ctx.$refs.messageInput.value,).toBe("",);
    expect(ctx.messages,).toHaveLength(1,);
    expect(ctx.messages[0]!.id,).toMatch(/^tmp-[0-9a-f-]{36}$/,);
    expect(ctx.messages[0]!.role,).toBe("user",);
    // SSE path keeps the spinner until the generation stream ends.
    expect(ctx.isGenerating,).toBe(true,);
  });

  test("keeps the optimistic message labelled for media-only sends", async () => {
    const ctx = buildCtx({ pendingAssets: [{ assetId: "a1", filename: "pic.png", },], },);
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(postBody().content,).toBeUndefined();
    expect(ctx.messages[0]!.content,).toBe("(attached media)",);
  });

  test("sets parentId to the last real message and orders attachments", async () => {
    const ctx = buildCtx({
      messages: [{ id: "real-1", role: "assistant", content: "", created_at: "2026-01-01T00:00:00.000Z", }, { id: "tmp-old", role: "user", content: "", created_at: "2026-01-01T00:00:00.000Z", },],
      pendingAssets: [
        { assetId: "b", filename: "b.png", },
        { assetId: "a", filename: "a.png", },
      ],
    },);
    ctx.$refs.messageInput.value = "reply";
    handler = async () => Response.json({ id: "m2", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    const body = postBody();
    expect(body.parentId,).toBe("real-1",);
    expect(body.attachments,).toEqual([
      { assetId: "b", order: 0, label: "message-attachment", },
      { assetId: "a", order: 1, label: "message-attachment", },
    ],);
  });

  test("encrypts content through the real pipeline when the chat key is active", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, ["encrypt", "decrypt",],);
    const ctx = buildCtx({ _encryptionEnabled: true, _chatKey: key, _keyId: "key-9", },);
    ctx.$refs.messageInput.value = "secret";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    const payload = JSON.parse(String(postBody().content,),) as {
      algo: string;
      key_id: string;
      comp: boolean;
      enc: string;
      nonce: string;
    };
    expect(payload.algo,).toBe("aes-256-gcm",);
    expect(payload.key_id,).toBe("key-9",);
    expect(payload.comp,).toBe(false,);
    expect(payload.enc,).not.toContain("secret",);
    expect(payload.nonce.length,).toBeGreaterThan(0,);
  });

  test("command actions skip the SSE connection and clear the spinner", async () => {
    const actions: string[] = [];
    const sse: (string | null)[] = [];
    const ctx = buildCtx({
      dispatchCommandAction: async (action,) => {
        actions.push(action,);
      },
      connectGenerationSSE: (chatId,) => {
        sse.push(chatId,);
      },
    },);
    ctx.$refs.messageInput.value = "/roll";
    handler = async () => Response.json({ action: "wizard-preview", actionPayload: { wizardId: "w1", }, },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(actions,).toEqual(["wizard-preview",],);
    expect(sse,).toEqual([],);
    expect(ctx.isGenerating,).toBe(false,);
  });

  test("a human send fires user-triggered quick replies and resets the loop counter", async () => {
    const triggers: string[] = [];
    const ctx = buildCtx({
      fireAutoQuickReplies: async (trigger,) => {
        triggers.push(trigger,);
      },
      _consecutiveAutoFires: 4,
    },);
    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx._consecutiveAutoFires,).toBe(0,);
    expect(triggers,).toEqual(["user",],);
  });

  test("an automated send counts toward the loop cap and triggers nothing", async () => {
    const triggers: string[] = [];
    const ctx = buildCtx({
      _autoFired: true,
      _consecutiveAutoFires: 2,
      fireAutoQuickReplies: async (trigger,) => {
        triggers.push(trigger,);
      },
    },);
    ctx.$refs.messageInput.value = "auto";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx._autoFired,).toBe(false,);
    expect(ctx._consecutiveAutoFires,).toBe(3,);
    expect(triggers,).toEqual([],);
  });
});

describe("chatSendMethods.sendMessage — failure paths", () => {
  test("rolls the temp message back and toasts the server error", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({ error: "rate limited", }, { status: 429, },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.messages,).toEqual([],);
    expect(ctx.isGenerating,).toBe(false,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "rate limited", },],);
    expect(ctx._autoFired,).toBe(false,);
  });

  test("falls back to a generic toast when the error body is opaque", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({}, { status: 500, },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.toasts[0]!.type,).toBe("error",);
    expect(ctx.messages,).toEqual([],);
  });

  test("network failures roll back and toast", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () => {
      throw new Error("offline",);
    };
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.messages,).toEqual([],);
    expect(ctx.isGenerating,).toBe(false,);
    expect(ctx.toasts[0]!.type,).toBe("error",);
  });
});
