import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatActions, } from "./chat-actions";

/**
 * Dispatch tests for the deterministic B4 entity actions: apply-entity,
 * add-entity, clone-entity. Each handler must call the REAL backend route
 * the preview documents, ask for confirmation naming the ENTITY (not the
 * id), and toast through the shared i18n keys.
 */

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
  }>,
) {
  const toasts: { type: string; message: string }[] = overrides?.toasts ?? [];
  return {
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
    toasts,
  };
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

async function dispatch(ctx: unknown, action: string, payload: Record<string, unknown> | null,) {
  await chatActions.dispatchCommandAction!.call(ctx as any, action, payload, "chat-1",);
}

describeOrSkip("dispatchCommandAction apply-entity", () => {
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

  test("confirmed world apply PUTs the patch to /api/v1/worlds/:wid and toasts success", async () => {
    confirmWith(true,);
    mockFetch(200, { ok: true, },);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "world",
      entityId: "w1",
      worldId: "w1",
      name: "Emberfall",
      updates: { name: "New Ember", scanDepth: 80, },
    },);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ name: "New Ember", scanDepth: 80, },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Changes applied to Emberfall", },],);
  });

  test("confirmed location apply PUTs to /api/v1/worlds/:wid/locations/:lid", async () => {
    confirmWith(true,);
    mockFetch(200, { ok: true, },);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "location",
      entityId: "loc-1",
      worldId: "w1",
      name: "Ash Gate",
      updates: { name: "Iron Gate", coordX: 3, },
    },);

    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/locations/loc-1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
  });

  test("confirmed item apply PUTs to /api/v1/worlds/:wid/items/:iid", async () => {
    confirmWith(true,);
    mockFetch(200, {},);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "item",
      entityId: "i1",
      worldId: "w1",
      name: "Iron Sword",
      updates: { value: 65, },
    },);

    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/items/i1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
  });

  test("confirm dialog shows the entity name, not the raw id", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(200,);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "location",
      entityId: "loc-1",
      worldId: "w1",
      name: "Ash Gate",
      updates: { name: "Iron Gate", },
    },);

    expect(captured.message,).toContain("Ash Gate",);
    expect(captured.message,).not.toContain("loc-1",);
  });

  test("confirm dialog falls back to the entity id when the name is empty", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(200,);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "location",
      entityId: "loc-1",
      worldId: "w1",
      name: "",
      updates: { name: "Iron Gate", },
    },);

    expect(captured.message,).toContain("loc-1",);
  });

  test("dismissed confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "world",
      entityId: "w1",
      worldId: "w1",
      name: "Emberfall",
      updates: { name: "X", },
    },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing payload fields send nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", { entityId: "w1", worldId: "w1", updates: { name: "X", }, },);
    await dispatch(ctx, "apply-entity", { kind: "world", worldId: "w1", updates: { name: "X", }, },);
    await dispatch(ctx, "apply-entity", { kind: "world", entityId: "w1", updates: { name: "X", }, },);
    await dispatch(ctx, "apply-entity", { kind: "world", entityId: "w1", worldId: "w1", },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("unknown kind sends nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "dragon",
      entityId: "c1",
      worldId: "w1",
      name: "Iria",
      updates: { name: "X", },
    },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed PUT toasts error", async () => {
    confirmWith(true,);
    mockFetch(403, { error: "forbidden", },);
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "location",
      entityId: "loc-1",
      worldId: "w1",
      name: "Ash Gate",
      updates: { name: "Iron Gate", },
    },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to apply changes to Ash Gate", },],);
  });

  test("network failure toasts error", async () => {
    confirmWith(true,);
    mockFetchNetworkError();
    const ctx = buildCtx();
    await dispatch(ctx, "apply-entity", {
      kind: "world",
      entityId: "w1",
      worldId: "w1",
      name: "Emberfall",
      updates: { name: "X", },
    },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to apply changes to Emberfall", },],);
  });
},);

describeOrSkip("dispatchCommandAction add-entity", () => {
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

  test("confirmed location add POSTs name + fields to /api/v1/worlds/:wid/locations", async () => {
    confirmWith(true,);
    mockFetch(201, { id: "loc-new", },);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", {
      kind: "location",
      worldId: "w1",
      name: "Rustic Tavern",
      fields: { description: "Warm bread.", coordX: 1, },
    },);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/locations",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({
      name: "Rustic Tavern",
      description: "Warm bread.",
      coordX: 1,
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: "Rustic Tavern added", },],);
  });

  test("confirmed item add POSTs to /api/v1/worlds/:wid/items", async () => {
    confirmWith(true,);
    mockFetch(201, { id: "item-new", },);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", {
      kind: "item",
      worldId: "w1",
      name: "Iron Sword",
      fields: { value: 25, },
    },);

    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/items",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
  });

  test("confirm dialog names the kind and the entity", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(201,);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", { kind: "location", worldId: "w1", name: "Rustic Tavern", fields: {}, },);

    expect(captured.message,).toContain("location",);
    expect(captured.message,).toContain("Rustic Tavern",);
  });

  test("dismissed confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", { kind: "location", worldId: "w1", name: "Rustic Tavern", fields: {}, },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing payload fields send nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", { worldId: "w1", name: "Tavern", fields: {}, },);
    await dispatch(ctx, "add-entity", { kind: "location", name: "Tavern", fields: {}, },);
    await dispatch(ctx, "add-entity", { kind: "location", worldId: "w1", fields: {}, },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed POST toasts error", async () => {
    confirmWith(true,);
    mockFetch(409, { error: "conflict", },);
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", { kind: "item", worldId: "w1", name: "Iron Sword", fields: {}, },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to add Iron Sword", },],);
  });

  test("network failure toasts error", async () => {
    confirmWith(true,);
    mockFetchNetworkError();
    const ctx = buildCtx();
    await dispatch(ctx, "add-entity", { kind: "location", worldId: "w1", name: "Rustic Tavern", fields: {}, },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to add Rustic Tavern", },],);
  });
},);

describeOrSkip("dispatchCommandAction clone-entity", () => {
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

  test("confirmed location clone POSTs the copied fields to the create route", async () => {
    confirmWith(true,);
    mockFetch(201, { id: "loc-copy", },);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "location",
      sourceId: "loc-1",
      worldId: "w1",
      name: "Ash Gate (copy)",
      fields: { name: "Ash Gate (copy)", description: "A gate of black iron.", kind: "city", },
    },);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/locations",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({
      name: "Ash Gate (copy)",
      description: "A gate of black iron.",
      kind: "city",
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: "Copy of Ash Gate (copy) created", },],);
  });

  test("confirmed item clone POSTs to /api/v1/worlds/:wid/items", async () => {
    confirmWith(true,);
    mockFetch(201, { id: "item-copy", },);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "item",
      sourceId: "i1",
      worldId: "w1",
      name: "Iron Sword (copy)",
      fields: { name: "Iron Sword (copy)", value: 50, },
    },);

    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/items",);
    expect(fetchCalls[0]?.opts.method,).toBe("POST",);
  });

  test("confirm dialog shows the copy name, not the source id", async () => {
    const captured: { message?: string } = {};
    confirmWith(true, captured,);
    mockFetch(201,);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "location",
      sourceId: "loc-1",
      worldId: "w1",
      name: "Ash Gate (copy)",
      fields: { name: "Ash Gate (copy)", },
    },);

    expect(captured.message,).toContain("Ash Gate (copy)",);
    expect(captured.message,).not.toContain("loc-1",);
  });

  test("dismissed confirm sends nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "location",
      sourceId: "loc-1",
      worldId: "w1",
      name: "Ash Gate (copy)",
      fields: { name: "Ash Gate (copy)", },
    },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("missing payload fields send nothing", async () => {
    confirmWith(true,);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      sourceId: "loc-1",
      worldId: "w1",
      name: "X (copy)",
      fields: { name: "X (copy)", },
    },);

    await dispatch(ctx, "clone-entity", {
      kind: "location",
      worldId: "w1",
      name: "X (copy)",
      fields: { name: "X (copy)", },
    },);

    await dispatch(ctx, "clone-entity", {
      kind: "location",
      sourceId: "loc-1",
      name: "X (copy)",
      fields: { name: "X (copy)", },
    },);

    await dispatch(ctx, "clone-entity", { kind: "location", sourceId: "loc-1", worldId: "w1", name: "X (copy)", },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("failed POST toasts error", async () => {
    confirmWith(true,);
    mockFetch(409, { error: "conflict", },);
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "item",
      sourceId: "i1",
      worldId: "w1",
      name: "Iron Sword (copy)",
      fields: { name: "Iron Sword (copy)", },
    },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to create a copy of Iron Sword (copy)", },],);
  });

  test("network failure toasts error", async () => {
    confirmWith(true,);
    mockFetchNetworkError();
    const ctx = buildCtx();
    await dispatch(ctx, "clone-entity", {
      kind: "location",
      sourceId: "loc-1",
      worldId: "w1",
      name: "Ash Gate (copy)",
      fields: { name: "Ash Gate (copy)", },
    },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to create a copy of Ash Gate (copy)", },],);
  });
},);
