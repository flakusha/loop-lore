import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatActions, } from "./chat-actions";

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

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

function mockFetchNetworkError() {
  fetchHandler = () => {
    throw new Error("network",);
  };
}

/** Build a minimal ChatState-like context for dispatchCommandAction. */
function buildCtx(
  overrides?: Partial<{
    toasts: { type: string; message: string }[];
    sseChatIds: string[];
  }>,
) {
  const toasts: { type: string; message: string }[] = overrides?.toasts ?? [];
  const sseChatIds: string[] = overrides?.sseChatIds ?? [];
  return {
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
    connectGenerationSSE(chatId: string,) {
      sseChatIds.push(chatId,);
    },
    toasts,
    sseChatIds,
  };
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

// ── dispatchCommandAction ────────────────────────────────────

describe("dispatchCommandAction", () => {
  describe("generate-image", () => {
    test("fires POST to /api/generation/image with prompt + chatId", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/generation/image",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ prompt: "a cat", chatId: "chat-1", },);
    });

    test("connects SSE on 200 success", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.sseChatIds,).toEqual(["chat-1",],);
      expect(ctx.toasts,).toEqual([{ type: "info", message: "Image generation started", },],);
    });

    test("shows not-configured toast on 501", async () => {
      mockFetch(501,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.sseChatIds,).toEqual([],);
      expect(ctx.toasts[0]?.message,).toContain("not configured",);
    });

    test("shows error toast on 500 with error body", async () => {
      mockFetch(500, { error: "provider down", },);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.toasts,).toEqual([{ type: "error", message: "provider down", },],);
    });

    test("shows network error toast on fetch throw", async () => {
      mockFetchNetworkError();
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.toasts[0]?.type,).toBe("error",);
      expect(ctx.toasts[0]?.message,).toContain("Network error",);
    });

    test("warns when prompt is empty", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
      expect(ctx.toasts[0]?.message,).toContain("No input",);
    });

    test("warns when payload is null", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        null,
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
    });
  });

  describe("generate-caption", () => {
    test("fires POST to /api/generation/caption with assetIds + chatId", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        { assetIds: ["a1", "a2",], },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/generation/caption",);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ chatId: "chat-1", assetIds: ["a1", "a2",], },);
    });

    test("connects SSE on success", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        { assetIds: ["a1",], },
        "chat-1",
      );

      expect(ctx.sseChatIds,).toEqual(["chat-1",],);
      expect(ctx.toasts[0]?.message,).toContain("Captioning started",);
    });

    test("warns when assetIds is empty", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        { assetIds: [], },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
      expect(ctx.toasts[0]?.message,).toContain("No assets",);
    });

    test("warns when assetIds missing from payload", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        {},
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
    });
  });

  describe("unimplemented generation actions", () => {
    test("generate-music shows not-implemented toast", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-music",
        { prompt: "jazz", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("info",);
      expect(ctx.toasts[0]?.message,).toContain("not yet implemented",);
    });

    test("generate-sfx shows not-implemented toast", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-sfx",
        { prompt: "explosion", },
        "chat-1",
      );

      expect(ctx.toasts[0]?.message,).toContain("not yet implemented",);
    });

    test("generate-video shows not-implemented toast", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-video",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.toasts[0]?.message,).toContain("not yet implemented",);
    });
  });

  describe("create-quest", () => {
    test("fires POST to /api/quests with description + chatId", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "defeat the dragon", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/quests",);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ chatId: "chat-1", description: "defeat the dragon", },);
    });

    test("shows success toast on 200", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "find the sword", },
        "chat-1",
      );

      expect(ctx.toasts,).toEqual([{ type: "info", message: "Quest created", },],);
    });

    test("shows error toast on failure", async () => {
      mockFetch(500, { error: "db error", },);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "find the sword", },
        "chat-1",
      );

      expect(ctx.toasts,).toEqual([{ type: "error", message: "db error", },],);
    });

    test("warns when description is empty", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
      expect(ctx.toasts[0]?.message,).toContain("No quest description",);
    });

    test("handles null payload gracefully", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        null,
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts[0]?.type,).toBe("warning",);
    });
  });

  describe("review-entity", () => {
    test("does not fire any fetch", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "review-entity",
        { name: "Gandalf", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts.length,).toBe(0,);
    });
  });

  describe("unknown action", () => {
    test("shows warning toast for unrecognized action", async () => {
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "do-something-else",
        {},
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(0,);
      expect(ctx.toasts,).toEqual([{ type: "warning", message: "Unknown action: do-something-else", },],);
    });
  });
});

// ── handleCommandInput ───────────────────────────────────────

describe("handleCommandInput", () => {
  test("shows palette when typing slash without space", () => {
    const state = {
      _showCommandPalette: false,
      _filteredCommands: [],
      _commandList: chatActions._commandList,
    };
    const event = { target: { value: "/im", }, } as unknown as Event;

    chatActions.handleCommandInput!.call(state as any, event,);

    expect(state._showCommandPalette,).toBe(true,);
    expect(state._filteredCommands.length,).toBeGreaterThan(0,);
    expect(state._filteredCommands.every((c: { name: string },) => c.name.includes("im",)),).toBe(true,);
  });

  test("hides palette when no slash prefix", () => {
    const state = {
      _showCommandPalette: true,
      _filteredCommands: [],
      _commandList: chatActions._commandList,
    };
    const event = { target: { value: "hello", }, } as unknown as Event;

    chatActions.handleCommandInput!.call(state as any, event,);

    expect(state._showCommandPalette,).toBe(false,);
  });

  test("hides palette when space follows slash", () => {
    const state = {
      _showCommandPalette: true,
      _filteredCommands: [],
      _commandList: chatActions._commandList,
    };
    const event = { target: { value: "/im hello", }, } as unknown as Event;

    chatActions.handleCommandInput!.call(state as any, event,);

    expect(state._showCommandPalette,).toBe(false,);
  });

  test("shows all commands when just /", () => {
    const state = {
      _showCommandPalette: false,
      _filteredCommands: [],
      _commandList: chatActions._commandList,
    };
    const event = { target: { value: "/", }, } as unknown as Event;

    chatActions.handleCommandInput!.call(state as any, event,);

    expect(state._showCommandPalette,).toBe(true,);
    expect(state._filteredCommands.length,).toBe(state._commandList?.length ?? 0,);
  });
});

// ── selectCommand ────────────────────────────────────────────

describe("selectCommand", () => {
  test("sets input value to /name and hides palette", () => {
    const inputEl = { value: "", focus() {}, };
    const state = {
      _showCommandPalette: true,
      $refs: { messageInput: inputEl, },
    };

    chatActions.selectCommand!.call(state as any, "image",);

    expect(inputEl.value,).toBe("/image ",);
    expect(state._showCommandPalette,).toBe(false,);
  });

  test("handles missing $refs gracefully", () => {
    const state = { _showCommandPalette: true, $refs: undefined, };

    expect(() => chatActions.selectCommand!.call(state as any, "image",)).not.toThrow();
    expect(state._showCommandPalette,).toBe(false,);
  });

  test("handles missing messageInput gracefully", () => {
    const state = { _showCommandPalette: true, $refs: {}, };

    expect(() => chatActions.selectCommand!.call(state as any, "image",)).not.toThrow();
    expect(state._showCommandPalette,).toBe(false,);
  });
});
