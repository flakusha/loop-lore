// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the chat-settings classifier tag subset picker: loads the
 * vocabulary + active subset, toggles with a dirty flag, and PUTs the
 * selection to the per-chat endpoint (mirrors the quick-replies test stub).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { classifierTagsActions, } from "./classifier-tags";

// ── Network stub (classifier-tags imports apiFetch from ../htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: (() => Response) | null = null;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  globalThis.fetch = (async (url: string | URL | Request, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts: opts ?? {}, },);
    return fetchHandler ? fetchHandler() : Response.json({ ok: true, },);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

interface Toast {
  event: string;
  detail: { type: string; message: string };
}

function buildCtx(overrides?: { activeChat?: string | null; toasts?: Toast[] },) {
  const toasts = overrides?.toasts ?? [];
  const ctx = {
    activeChat: overrides?.activeChat !== undefined ? overrides.activeChat : "chat-1",
    _classifierVocabulary: [] as string[],
    _classifierActive: [] as string[],
    _classifierDirty: false,
    loadClassifierTags: () => {},
    $dispatch: (event: string, detail: { type: string; message: string },) => {
      toasts.push({ event, detail, },);
    },
  };

  return { ctx, toasts, };
}

describe("classifierTagsActions.loadClassifierTags", () => {
  test("loads the vocabulary and active subset for the active chat", async () => {
    const { ctx, } = buildCtx();
    fetchHandler = () => Response.json({ vocabulary: ["a", "b",], active: ["b",], },);
    await classifierTagsActions.loadClassifierTags!.call(ctx as never,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/classifier-tags",);
    expect(ctx._classifierVocabulary,).toEqual(["a", "b",],);
    expect(ctx._classifierActive,).toEqual(["b",],);
    expect(ctx._classifierDirty,).toBe(false,);
  });

  test("no-ops without an active chat and survives a network error", async () => {
    const noChat = buildCtx({ activeChat: null, },);
    await classifierTagsActions.loadClassifierTags!.call(noChat.ctx as never,);
    expect(fetchCalls,).toEqual([],);

    const { ctx, } = buildCtx();
    globalThis.fetch = (async () => {
      throw new Error("down",);
    }) as unknown as typeof fetch;

    await classifierTagsActions.loadClassifierTags!.call(ctx as never,);
    expect(ctx._classifierVocabulary,).toEqual([],);
  });
});

describe("classifierTagsActions.toggleClassifierTag", () => {
  test("toggles membership and marks the selection dirty", () => {
    const { ctx, } = buildCtx();
    ctx._classifierActive = ["a",];
    classifierTagsActions.toggleClassifierTag!.call(ctx as never, "b",);
    expect(ctx._classifierActive,).toEqual(["a", "b",],);
    expect(ctx._classifierDirty,).toBe(true,);
    classifierTagsActions.toggleClassifierTag!.call(ctx as never, "b",);
    expect(ctx._classifierActive,).toEqual(["a",],);
  });
});

describe("classifierTagsActions.saveClassifierTags", () => {
  test("PUTs the active subset and clears the dirty flag on success", async () => {
    const { ctx, toasts, } = buildCtx();
    ctx._classifierActive = ["a", "b",];
    ctx._classifierDirty = true;
    await classifierTagsActions.saveClassifierTags!.call(ctx as never,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/classifier-tags",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    const body = JSON.parse(String(fetchCalls[0]?.opts.body,),) as { tags: string[] };
    expect(body.tags,).toEqual(["a", "b",],);
    expect(ctx._classifierDirty,).toBe(false,);
    expect(toasts[0]?.detail.type,).toBe("success",);
  });

  test("no-ops when not dirty", async () => {
    const { ctx, } = buildCtx();
    await classifierTagsActions.saveClassifierTags!.call(ctx as never,);
    expect(fetchCalls,).toEqual([],);
  });

  test("shows an error toast and reloads on rejection", async () => {
    const { ctx, toasts, } = buildCtx();
    let reloads = 0;
    ctx.loadClassifierTags = () => {
      reloads++;
    };

    ctx._classifierActive = ["ghost",];
    ctx._classifierDirty = true;
    fetchHandler = () => Response.json({ error: "outside vocabulary", }, { status: 400, },);
    await classifierTagsActions.saveClassifierTags!.call(ctx as never,);
    expect(ctx._classifierDirty,).toBe(false,);
    expect(ctx._classifierActive,).toEqual([],);
    expect(toasts[0]?.detail.type,).toBe("error",);
    // The ground truth reload ran after the failed save.
    expect(reloads,).toBe(1,);
  });
});
