import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";
import "./i18n.test-helper";
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
},);

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = originalFetch;
},);

afterAll(() => {
  globalState.apiFetch = originalFetch;
},);

interface Toast {
  type: string;
  message: string;
}

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
  sendWithPreferredMode: (chatId: string | null,) => Promise<void>;
  dispatchCommandAction: (action: string, payload: unknown, chatId: string | null,) => Promise<void>;
  fireAutoQuickReplies: (trigger: "user" | "ai",) => Promise<void>;
  clearedDrafts: number;
  flushedDrafts: number;
  clearComposerDraft: () => void;
  flushComposerDraft: () => void;
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
    $refs: { messageInput: { value: "", }, },
    autoResize: () => {},
    scrollToBottom: () => {},
    loadMessages: async () => {},
    loadChats: async () => {},
    sendWithPreferredMode: async () => {},
    dispatchCommandAction: async () => {},
    fireAutoQuickReplies: async () => {},
    clearedDrafts: 0,
    flushedDrafts: 0,
    clearComposerDraft: () => {
      ctx.clearedDrafts += 1;
    },
    flushComposerDraft: () => {
      ctx.flushedDrafts += 1;
    },
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
  const post = calls.find((c,) => c.opts.method === "POST")!;
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
    expect(calls[0]!.url,).toBe("/api/v1/chats/chat-1/messages",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(ctx.$refs.messageInput.value,).toBe("",);
    expect(ctx.messages,).toHaveLength(1,);
    expect(ctx.messages[0]!.id,).toMatch(/^tmp-[0-9a-f-]{36}$/,);
    expect(ctx.messages[0]!.role,).toBe("user",);
    // SSE path keeps the spinner until the generation stream ends.
    expect(ctx.isGenerating,).toBe(true,);
  });

  test("routes generation through the per-chat stream preference", async () => {
    const routed: (string | null)[] = [];
    const ctx = buildCtx({
      sendWithPreferredMode: async (chatId,) => {
        routed.push(chatId,);
      },
    },);

    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(routed,).toEqual(["chat-1",],);
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
      messages: [{ id: "real-1", role: "assistant", content: "", created_at: "2026-01-01T00:00:00.000Z", }, {
        id: "tmp-old",
        role: "user",
        content: "",
        created_at: "2026-01-01T00:00:00.000Z",
      },],
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
      sendWithPreferredMode: async (chatId,) => {
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

  test("503 with persisted id reconciles the temp message instead of dropping it", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () =>
      Response.json(
        {
          error: "Could not persist reply due to high concurrency. Please retry.",
          code: "SERVICE_UNAVAILABLE",
          id: "persisted-42",
          context: { usedTokens: 0, maxTokens: 8192, },
        },
        { status: 503, },
      );

    await chatSendMethods.sendMessage!.call(ctx as never,);
    // The temp message is reconciled to the persisted id, not removed.
    expect(ctx.messages,).toHaveLength(1,);
    expect(ctx.messages[0]!.id,).toBe("persisted-42",);
    // The composer is NOT restored — the message was stored.
    expect(ctx.$refs.messageInput.value,).toBe("",);
    expect(ctx.flushedDrafts,).toBe(0,);
    // An error toast is still shown.
    expect(ctx.toasts[0]!.type,).toBe("error",);
    expect(ctx.isGenerating,).toBe(false,);
  });
});

describe("chatSendMethods.interceptSlashSend", () => {
  type SlashCtx = SendCtx & {
    messages: { id: string; role: string; content: string; created_at: string }[];
    _commandList?: { name: string }[];
    activeAttemptId?: string | null;
    continueMessage?: (id: string,) => Promise<void>;
    retryFromPoint?: (id: string, step: number,) => Promise<void>;
    forkFromMessage?: (id: string, name?: string,) => Promise<void>;
    interceptSlashSend?: (text: string, input: HTMLTextAreaElement,) => Promise<boolean>;
  };

  function slashCtx(overrides?: Partial<SlashCtx>,): SlashCtx {
    return buildCtx({
      messages: [],
      ...overrides,
    },) as SlashCtx;
  }

  function msg(id: string, role: string,): { id: string; role: string; content: string; created_at: string } {
    return { id, role, content: "", created_at: "2026-01-01T00:00:00.000Z", };
  }

  test("empty command name passes through to a normal send", async () => {
    const ctx = slashCtx();
    const input = { value: "/", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/", input,),).toBe(false,);
  });

  test("/continue resumes the last assistant message and clears the input", async () => {
    const continued: string[] = [];
    const ctx = slashCtx({
      messages: [msg("u1", "user",), msg("a1", "assistant",),],
      continueMessage: async (id,) => {
        continued.push(id,);
      },
    },);

    const input = { value: "/continue", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/continue", input,),).toBe(true,);
    expect(continued,).toEqual(["a1",],);
    expect(input.value,).toBe("",);
  });

  test("/continue with no prior assistant message warns", async () => {
    const ctx = slashCtx({ messages: [msg("u1", "user",),], },);
    const input = { value: "/continue", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/continue", input,),).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
  });

  test("/continue works when the cross-slice method is absent", async () => {
    const ctx = slashCtx({ messages: [msg("a1", "character",),], },);

    delete ctx.continueMessage;
    const input = { value: "/continue", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/continue", input,),).toBe(true,);
    expect(input.value,).toBe("",);
  });

  test("/retry prefers the active attempt and parses the step", async () => {
    const retried: [string, number,][] = [];
    const ctx = slashCtx({
      activeAttemptId: "a1",
      retryFromPoint: async (id, step,) => {
        retried.push([id, step,],);
      },
    },);

    const input = { value: "/retry 2", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/retry 2", input,),).toBe(true,);
    expect(retried,).toEqual([["a1", 2,],],);
    expect(input.value,).toBe("",);
  });

  test("/retry takes the attempt id from args when no attempt is active", async () => {
    const retried: [string, number,][] = [];
    const ctx = slashCtx({
      activeAttemptId: null,
      retryFromPoint: async (id, step,) => {
        retried.push([id, step,],);
      },
    },);

    const input = { value: "/retry a9 3", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/retry a9 3", input,),).toBe(true,);
    expect(retried,).toEqual([["a9", 3,],],);
  });

  test("/retry with no attempt id warns", async () => {
    const ctx = slashCtx({ activeAttemptId: null, },);
    const input = { value: "/retry", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/retry", input,),).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
  });

  test("/branch forks the last assistant message with the trailing prompt", async () => {
    const forked: [string, string | undefined,][] = [];
    const ctx = slashCtx({
      messages: [msg("a1", "assistant",),],
      forkFromMessage: async (id, name,) => {
        forked.push([id, name,],);
      },
    },);

    const input = { value: "/branch alt take", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/branch alt take", input,),).toBe(true,);
    expect(forked,).toEqual([["a1", "alt take",],],);
    expect(input.value,).toBe("",);
  });

  test("/branch with no prior assistant message warns", async () => {
    const ctx = slashCtx({ messages: [], },);
    const input = { value: "/branch", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/branch", input,),).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
  });

  test("unknown commands toast, with a did-you-mean hint when close", async () => {
    const ctx = slashCtx({ _commandList: [{ name: "roll", }, { name: "help", },], },);
    const input = { value: "/rol", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/rol", input,),).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
    expect(String(ctx.toasts[0]!.message,),).toContain("/rol",);
    expect(String(ctx.toasts[0]!.message,),).toContain("/roll",);
  });

  test("unknown commands toast plainly when nothing is near", async () => {
    const ctx = slashCtx({ _commandList: [{ name: "roll", },], },);
    const input = { value: "/zzz", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/zzz", input,),).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("warning",);
    expect(String(ctx.toasts[0]!.message,),).toContain("/zzz",);
  });

  test("known commands and an empty registry pass through", async () => {
    const ctx = slashCtx({ _commandList: [{ name: "roll", },], },);
    const input = { value: "/roll", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(ctx as never, "/roll", input,),).toBe(false,);
    const bare = slashCtx();
    const bareInput = { value: "/zzz", } as unknown as HTMLTextAreaElement;

    expect(await chatSendMethods.interceptSlashSend!.call(bare as never, "/zzz", bareInput,),).toBe(false,);
  });

  test("sendMessage routes slash text through the interceptor", async () => {
    const continued: string[] = [];
    const ctx = slashCtx({
      messages: [msg("a1", "assistant",),],
      interceptSlashSend: chatSendMethods.interceptSlashSend,
      continueMessage: async (id,) => {
        continued.push(id,);
      },
    },);

    ctx.$refs.messageInput.value = "/continue";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(continued,).toEqual(["a1",],);
    expect(calls,).toEqual([],);
  });

  test("sendMessage skips interception when assets are pending or the slice is absent", async () => {
    const intercepted: string[] = [];
    const ctx = slashCtx({
      pendingAssets: [{ assetId: "a1", filename: "pic.png", },],
      interceptSlashSend: async (text: string,) => {
        intercepted.push(text,);

        return true;
      },
    },);

    ctx.$refs.messageInput.value = "/continue";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(intercepted,).toEqual([],);
    expect(calls.length,).toBeGreaterThan(0,);
    const bare = buildCtx();

    delete (bare as unknown as Record<string, unknown>).interceptSlashSend;
    bare.$refs.messageInput.value = "/roll";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(bare as never,);
    expect(calls.length,).toBeGreaterThan(0,);
  });
});

describe("chatSendMethods.sendMessage — composer drafts", () => {
  test("clears the composer draft after a successful send", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({ id: "m1", },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.clearedDrafts,).toBe(1,);
    expect(ctx.flushedDrafts,).toBe(0,);
  });

  test("flushes the restored input when the send fails", async () => {
    const ctx = buildCtx();
    ctx.$refs.messageInput.value = "hello";
    handler = async () => Response.json({ error: "boom", }, { status: 500, },);
    await chatSendMethods.sendMessage!.call(ctx as never,);
    expect(ctx.clearedDrafts,).toBe(0,);
    expect(ctx.flushedDrafts,).toBe(1,);
  });
});
