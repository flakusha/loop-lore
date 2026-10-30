import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatActions, } from "./chat-actions";

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

/** */
function mockFetchNetworkError() {
  fetchHandler = () => {
    throw new Error("network",);
  };
}

/**
 * Build a minimal ChatState-like context for dispatchCommandAction.
 * @param overrides
 */
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

describeOrSkip("dispatchCommandAction", () => {
  describeOrSkip("generate-image", () => {
    test("fires POST to /api/v1/generation/image with prompt + chatId", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/generation/image",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ prompt: "a cat", chatId: "chat-1", },);
    });

    test("forwards bindActorAvatar from the payload (/avatar rides the same action)", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "Elara portrait", bindActorAvatar: "actor-1", },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ prompt: "Elara portrait", chatId: "chat-1", bindActorAvatar: "actor-1", },);
    });

    test("does NOT arm the LLM SSE on 200 (image POST writes no generation buffer)", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-image",
        { prompt: "a cat", },
        "chat-1",
      );

      expect(ctx.sseChatIds,).toEqual([],);
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
  },);

  describeOrSkip("generate-caption", () => {
    test("fires POST to /api/v1/generation/caption with assetIds + chatId", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        { assetIds: ["a1", "a2",], },
        "chat-1",
      );

      expect(fetchCalls.length,).toBe(1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/generation/caption",);
      const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
      expect(body,).toEqual({ chatId: "chat-1", assetIds: ["a1", "a2",], },);
    });

    test("does NOT arm the LLM SSE on success (caption POST writes no generation buffer)", async () => {
      mockFetch(200,);
      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "generate-caption",
        { assetIds: ["a1",], },
        "chat-1",
      );

      expect(ctx.sseChatIds,).toEqual([],);
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
  },);

  describeOrSkip("unimplemented generation actions", () => {
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
  },);

  describeOrSkip("create-quest", () => {
    test("fetches chat world_id then fires POST to /api/v1/worlds/:wid/quests", async () => {
      let callCount = 0;
      fetchHandler = (url, _opts,) => {
        callCount++;
        if (url === "/api/v1/chats/chat-1") {
          return Response.json({ id: "chat-1", world_id: "world-42", }, { status: 200, },);
        }

        return Response.json({}, { status: 200, },);
      };

      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "defeat the dragon", },
        "chat-1",
      );

      expect(callCount,).toBe(2,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1",);
      expect(fetchCalls[1]?.url,).toBe("/api/v1/worlds/world-42/quests",);
      expect(fetchCalls[1]?.opts.method,).toBe("POST",);
      const body = JSON.parse(fetchCalls[1]?.opts.body as string,);
      expect(body,).toEqual({ chatId: "chat-1", description: "defeat the dragon", },);
    });

    test("shows warning when chat has no world_id", async () => {
      fetchHandler = (url, _opts,) => {
        if (url === "/api/v1/chats/chat-1") {
          return Response.json({ id: "chat-1", world_id: null, }, { status: 200, },);
        }

        return Response.json({}, { status: 200, },);
      };

      const ctx = buildCtx();
      await chatActions.dispatchCommandAction!.call(
        ctx as any,
        "create-quest",
        { description: "defeat the dragon", },
        "chat-1",
      );

      expect(ctx.toasts[0]?.type,).toBe("warning",);
      expect(ctx.toasts[0]?.message,).toContain("require a world",);
    });

    test("shows success toast on 200", async () => {
      fetchHandler = (url, _opts,) => {
        if (url === "/api/v1/chats/chat-1") {
          return Response.json({ id: "chat-1", world_id: "w1", }, { status: 200, },);
        }

        return Response.json({}, { status: 200, },);
      };

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
      fetchHandler = (url, _opts,) => {
        if (url === "/api/v1/chats/chat-1") {
          return Response.json({ id: "chat-1", world_id: "w1", }, { status: 200, },);
        }

        return Response.json({ error: "db error", }, { status: 500, },);
      };

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
  },);

  describeOrSkip("review-entity", () => {
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
  },);

  describeOrSkip("unknown action", () => {
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
  },);
},);

// ── handleCommandInput ───────────────────────────────────────

describeOrSkip("handleCommandInput", () => {
  // _commandList is hydrated at runtime from GET /api/v1/commands; tests need a
  // populated list to exercise the filter logic.
  type CommandEntry = { name: string; descriptionKey: string; description: string };
  const seededCommandList: CommandEntry[] = [
    { name: "help", descriptionKey: "commands.help", description: "help", },
    { name: "roll", descriptionKey: "commands.roll", description: "roll", },
    { name: "summarize", descriptionKey: "commands.summarize", description: "summarize", },
    { name: "impersonate", descriptionKey: "commands.impersonate", description: "impersonate", },
    { name: "image", descriptionKey: "commands.image", description: "image", },
    { name: "improve", descriptionKey: "commands.improve", description: "improve", },
  ];

  type CommandInputState = {
    _showCommandPalette: boolean;
    _filteredCommands: CommandEntry[];
    _commandList: CommandEntry[];
  };

  const makeState = (init: { show: boolean },): CommandInputState => ({
    _showCommandPalette: init.show,
    _filteredCommands: [],
    _commandList: seededCommandList,
  });

  const invokeHandle = (state: CommandInputState, value: string,) => {
    const event: Event = { target: { value, }, } as unknown as Event;
    // handleCommandInput is typed as `Partial<ChatState>`; the test exercises
    // a minimal state slice, so we widen via unknown at the call boundary.
    chatActions.handleCommandInput!.call(
      state as unknown as Parameters<NonNullable<typeof chatActions.handleCommandInput>>[0],
      event,
    );
  };

  test("shows palette when typing slash without space", () => {
    const state = makeState({ show: false, },);
    invokeHandle(state, "/im",);
    expect(state._showCommandPalette,).toBe(true,);
    expect(state._filteredCommands.length,).toBeGreaterThan(0,);
    expect(state._filteredCommands.every((c,) => c.name.includes("im",)),).toBe(true,);
  });

  test("hides palette when no slash prefix", () => {
    const state = makeState({ show: true, },);
    invokeHandle(state, "hello",);
    expect(state._showCommandPalette,).toBe(false,);
  });

  test("hides palette when space follows slash", () => {
    const state = makeState({ show: true, },);
    invokeHandle(state, "/im hello",);
    expect(state._showCommandPalette,).toBe(false,);
  });

  test("shows all commands when just /", () => {
    const state = makeState({ show: false, },);
    invokeHandle(state, "/",);
    expect(state._showCommandPalette,).toBe(true,);
    expect(state._filteredCommands.length,).toBe(seededCommandList.length,);
  });
},);

// ── selectCommand ────────────────────────────────────────────

describeOrSkip("selectCommand", () => {
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
},);

describeOrSkip("dispatchCommandAction link-asset", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean,) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = () => value;
  }

  test("confirmed link POSTs to /api/v1/assets/:id/links and toasts success", async () => {
    confirmWith(true,);
    mockFetch(201, { id: "a1", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "link-asset",
      { assetId: "a1", filename: "castle.png", entityType: "chat", entityId: "chat-1", },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/assets/a1/links",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
    const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
    expect(body,).toEqual({ entityType: "chat", entityId: "chat-1", },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Asset linked: castle.png", },],);
  });

  test("dismissed confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "link-asset",
      { assetId: "a1", filename: "castle.png", entityType: "chat", entityId: "chat-1", },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing payload fields send nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "link-asset", { assetId: "a1", }, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed POST toasts error", async () => {
    confirmWith(true,);
    mockFetch(403, { error: "forbidden", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "link-asset",
      { assetId: "a1", filename: "castle.png", entityType: "chat", entityId: "chat-1", },
      "chat-1",
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to link castle.png", },],);
  });
},);

describeOrSkip("dispatchCommandAction loc-update", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean, captured?: { message?: string },) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = (message,) => {
      if (captured) { captured.message = message; }
      return value;
    };
  }

  test("confirmed loc-update PUTs the patch to /api/v1/worlds/:wid/locations/:lid and toasts success", async () => {
    confirmWith(true,);
    mockFetch(200, { ok: true, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", name: "Ash Gate", updates: { name: "Iron Gate", coordX: 3, }, },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/locations/loc-1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    const body = JSON.parse(fetchCalls[0]?.opts.body as string,);
    expect(body,).toEqual({ name: "Iron Gate", coordX: 3, },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Location updated", },],);
  });

  test("confirm dialog shows the location name, not the raw id", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", name: "Ash Gate", updates: { name: "Iron Gate", }, },
      "chat-1",
    );

    expect(captured.message,).toContain("Ash Gate",);
    expect(captured.message,).not.toContain("loc-1",);
  });

  test("confirm dialog falls back to the locId when the name is empty", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", name: "", updates: { name: "Iron Gate", }, },
      "chat-1",
    );

    expect(captured.message,).toContain("loc-1",);
  });

  test("dismissed confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", name: "Ash Gate", updates: { name: "Iron Gate", }, },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing payload fields send nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "loc-update", { locId: "loc-1", }, "chat-1",);
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed PUT toasts error", async () => {
    confirmWith(true,);
    mockFetch(403, { error: "forbidden", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "loc-update",
      { locId: "loc-1", worldId: "w1", name: "Ash Gate", updates: { name: "Iron Gate", }, },
      "chat-1",
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to update location", },],);
  });
},);

describeOrSkip("dispatchCommandAction impersonate", () => {
  test("impersonate-toggle off PUTs null and clears flags", async () => {
    mockFetch(200, {},);
    const ctx = buildCtx() as any;
    ctx.impersonationActive = true;
    ctx.impersonatingActorId = "c1";
    await chatActions.dispatchCommandAction!.call(ctx, "impersonate-toggle", { mode: "off", }, "chat-1",);
    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/impersonate",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ impersonateActorId: null, },);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.impersonatingActorId,).toBeNull();
  });

  test("impersonate-toggle default delegates to toggleImpersonate", async () => {
    let toggled = false;
    const ctx = buildCtx() as any;
    ctx.toggleImpersonate = async () => {
      toggled = true;
    };

    await chatActions.dispatchCommandAction!.call(ctx, "impersonate-toggle", null, "chat-1",);
    expect(toggled,).toBe(true,);
    expect(fetchCalls.length,).toBe(0,);
  });

  test("impersonate-select resolves a character and starts impersonation", async () => {
    fetchHandler = (url,) => {
      if (url.endsWith("/participants",)) {
        return Response.json([{ display_name: "Aria", actor_type: "character", actor_id: "c1", },], { status: 200, },);
      }

      return Response.json({}, { status: 200, },);
    };

    const ctx = buildCtx() as any;
    await chatActions.dispatchCommandAction!.call(
      ctx,
      "impersonate-select",
      { characterName: "aria", },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(2,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.impersonatingActorId,).toBe("c1",);
  });

  test("impersonate-select with unknown name toasts warning and skips PUT", async () => {
    fetchHandler = (_url,) => Response.json([], { status: 200, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "impersonate-select",
      { characterName: "Nobody", },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(1,);
    expect(ctx.toasts.length,).toBe(1,);
    expect(ctx.toasts[0]?.type,).toBe("warning",);
  });

  test("impersonate-select with empty name sends nothing", async () => {
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "impersonate-select", { characterName: "", }, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
  });

  test("review-entity is display-only", async () => {
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "review-entity", { id: "e1", }, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
  });
},);

describeOrSkip("dispatchCommandAction world-update / world-delete", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean,) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = () => value;
  }

  test("confirmed world-update PUTs the patch to /api/v1/worlds/:id and toasts success", async () => {
    confirmWith(true,);
    mockFetch(200, { ok: true, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "world-update",
      { worldId: "w1", updates: { description: "Colder", difficultyModifier: 3, }, },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({
      description: "Colder",
      difficultyModifier: 3,
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: "World saved", },],);
  });

  test("dismissed world-update sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "world-update",
      { worldId: "w1", updates: { description: "x", }, },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("world-update with no updates or no world id sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "world-update", { worldId: "w1", }, "chat-1",);
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "world-update",
      { updates: { description: "x", }, },
      "chat-1",
    );

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed world-update PUT toasts error", async () => {
    confirmWith(true,);
    mockFetch(403, { error: "forbidden", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "world-update",
      { worldId: "w1", updates: { description: "x", }, },
      "chat-1",
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to save", },],);
  });

  test("confirmed world-delete DELETEs /api/v1/worlds/:id and toasts success", async () => {
    confirmWith(true,);
    mockFetch(204,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "world-delete", { worldId: "w1", }, "chat-1",);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1",);
    expect(fetchCalls[0]?.opts.method,).toBe("DELETE",);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "World deleted", },],);
  });

  test("dismissed world-delete sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "world-delete", { worldId: "w1", }, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing world id sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "world-delete", {}, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed world-delete toasts error", async () => {
    confirmWith(true,);
    mockFetch(500, { error: "boom", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "world-delete", { worldId: "w1", }, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to delete world", },],);
  });
},);

describeOrSkip("dispatchCommandAction item mutations", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean,) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = () => value;
  }

  const TRANSFER_PAYLOAD = {
    worldId: "w1",
    instanceId: "wi-1",
    toLocationId: "loc-9",
    itemName: "Iron Sword",
    toName: "Ash Gate",
  };

  test("confirmed item-transfer POSTs the transfer route with toLocationId", async () => {
    confirmWith(true,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", TRANSFER_PAYLOAD, "chat-1",);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/item-instances/wi-1/transfer",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ quantity: 1, toLocationId: "loc-9", },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Item transferred", },],);
  });

  test("item-transfer with a character destination sends toActorId instead", async () => {
    confirmWith(true,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", {
      worldId: "w1",
      instanceId: "wi-1",
      toActorId: "char-3",
      itemName: "Iron Sword",
      toName: "Iria",
    }, "chat-1",);

    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ quantity: 1, toActorId: "char-3", },);
  });

  test("dismissed item-transfer confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", TRANSFER_PAYLOAD, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("item-transfer with missing payload fields sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", { worldId: "w1", }, "chat-1",);
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", null, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed item-transfer POST toasts error", async () => {
    confirmWith(true,);
    mockFetch(403, { error: "forbidden", },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", TRANSFER_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to transfer item", },],);
  });

  test("200 with success:false toasts error (route-level transfer failure)", async () => {
    confirmWith(true,);
    mockFetch(200, { success: false, fromRemaining: 0, toQuantity: 0, transferred: 0, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", TRANSFER_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to transfer item", },],);
  });

  test("item-transfer network error toasts error", async () => {
    confirmWith(true,);
    mockFetchNetworkError();
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-transfer", TRANSFER_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to transfer item", },],);
  });

  const DROP_PAYLOAD = {
    worldId: "w1",
    instanceId: "wi-2",
    toLocationId: "loc-9",
    itemName: "Torch",
    toName: "Ash Gate",
  };

  test("confirmed item-drop POSTs the transfer route with toLocationId", async () => {
    confirmWith(true,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-drop", DROP_PAYLOAD, "chat-1",);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/item-instances/wi-2/transfer",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ quantity: 1, toLocationId: "loc-9", },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Item dropped", },],);
  });

  test("dismissed item-drop confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-drop", DROP_PAYLOAD, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("item-drop with missing payload fields sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(
      ctx as any,
      "item-drop",
      { worldId: "w1", instanceId: "wi-2", },
      "chat-1",
    );

    await chatActions.dispatchCommandAction!.call(ctx as any, "item-drop", null, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed item-drop POST and network error toast errors", async () => {
    confirmWith(true,);
    mockFetch(500,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-drop", DROP_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to drop item", },],);

    mockFetchNetworkError();
    const ctx2 = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx2 as any, "item-drop", DROP_PAYLOAD, "chat-1",);
    expect(ctx2.toasts,).toEqual([{ type: "error", message: "Failed to drop item", },],);
  });

  test("item-drop 200 with success:false toasts error", async () => {
    confirmWith(true,);
    mockFetch(200, { success: false, transferred: 0, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-drop", DROP_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to drop item", },],);
  });

  const PICKUP_PAYLOAD = {
    worldId: "w1",
    instanceId: "wi-3",
    toActorId: "char-3",
    itemName: "Key",
    toName: "Iria",
  };

  test("confirmed item-pickup POSTs the transfer route with toActorId", async () => {
    confirmWith(true,);
    mockFetch(200,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", PICKUP_PAYLOAD, "chat-1",);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/item-instances/wi-3/transfer",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ quantity: 1, toActorId: "char-3", },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Item picked up", },],);
  });

  test("dismissed item-pickup confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", PICKUP_PAYLOAD, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("item-pickup with missing payload fields sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", { worldId: "w1", }, "chat-1",);
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", null, "chat-1",);
    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed item-pickup POST and network error toast errors", async () => {
    confirmWith(true,);
    mockFetch(404,);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", PICKUP_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to pick up item", },],);

    mockFetchNetworkError();
    const ctx2 = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx2 as any, "item-pickup", PICKUP_PAYLOAD, "chat-1",);
    expect(ctx2.toasts,).toEqual([{ type: "error", message: "Failed to pick up item", },],);
  });

  test("item-pickup 200 with success:false toasts error", async () => {
    confirmWith(true,);
    mockFetch(200, { success: false, transferred: 0, },);
    const ctx = buildCtx();
    await chatActions.dispatchCommandAction!.call(ctx as any, "item-pickup", PICKUP_PAYLOAD, "chat-1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to pick up item", },],);
  });
},);
