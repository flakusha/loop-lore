// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { type ChatBackgroundRow, chatBackgrounds, } from "./chat-backgrounds";
import type { ChatState, } from "./types";

// ── Mock ./htmx (chat-backgrounds imports apiFetch from ./htmx) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: ((url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

const row = (id: string, assetId: string | null,): ChatBackgroundRow => ({
  id,
  name: id,
  type: "image",
  location_id: null,
  asset_id: assetId,
  config: null,
  priority: 0,
});

const buildCtx = (activeChat: string | null,): ChatState =>
  ({
    ...chatBackgrounds,
    activeChat,
    _background: null,
    _backgrounds: [],
    _backgroundsLoading: false,
    _backgroundsOpen: false,
  }) as unknown as ChatState;

const okJson = (data: unknown,): Response => Response.json({ data, },);

const errRes = (status = 500,): Response => Response.json({ error: "boom", }, { status, },);

const flush = (): Promise<void> =>
  new Promise<void>((resolve,) => {
    setTimeout(() => resolve(), 0,);
  },);

describe("chatBackgrounds.backgroundImageUrl", () => {
  test("derives the raw asset URL from the stored background's asset id", () => {
    const state = {
      ...chatBackgrounds,
      _background: {
        id: "bg-1",
        name: "Forest",
        type: "image",
        location_id: null,
        asset_id: "asset-1",
        config: null,
        priority: 0,
      },
    } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBe("/api/v1/assets/asset-1/raw",);
  });

  test("returns null when no background is assigned", () => {
    const state = { ...chatBackgrounds, _background: null, } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBeNull();
  });

  test("returns null when the assigned background has no asset", () => {
    const state = {
      ...chatBackgrounds,
      _background: {
        id: "bg-2",
        name: "Plain",
        type: "image",
        location_id: null,
        asset_id: null,
        config: null,
        priority: 0,
      },
    } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBeNull();
  });
});

describe("chatBackgrounds.backgroundType", () => {
  const withType = (type: string,): ChatState =>
    ({
      ...chatBackgrounds,
      _background: { ...row("bg-1", "asset-1",), type, },
    }) as unknown as ChatState;

  test("returns the stored type for every backend-known value", () => {
    for (const type of ["static", "animated", "parallax", "particle", "video",]) {
      expect(chatBackgrounds.backgroundType!.call(withType(type,),),).toBe(type,);
    }
  });

  test("returns null for an unknown or future type", () => {
    expect(chatBackgrounds.backgroundType!.call(withType("hologram",),),).toBeNull();
  });

  test("returns null when no background is assigned", () => {
    const state = { ...chatBackgrounds, _background: null, } as unknown as ChatState;

    expect(chatBackgrounds.backgroundType!.call(state,),).toBeNull();
  });
});

describeOrSkip("chatBackgrounds.toggleBackgroundPanel", () => {
  test("opening the panel loads the backgrounds, closing does not", async () => {
    handler = async (url,) =>
      url === "/api/v1/backgrounds" ? okJson([row("bg-1", "asset-1",),],) : okJson(row("bg-2", "asset-2",),);

    const ctx = buildCtx("chat-1",);

    chatBackgrounds.toggleBackgroundPanel!.call(ctx,);
    expect(ctx._backgroundsOpen,).toBe(true,);
    await flush();
    expect(calls.map((c,) => c.url),).toContain("/api/v1/backgrounds",);

    const before = calls.length;
    chatBackgrounds.toggleBackgroundPanel!.call(ctx,);
    await flush();
    expect(ctx._backgroundsOpen,).toBe(false,);
    expect(calls,).toHaveLength(before,);
  });

  test("opening the panel without an active chat does not fetch", async () => {
    const ctx = buildCtx(null,);

    chatBackgrounds.toggleBackgroundPanel!.call(ctx,);
    await flush();

    expect(ctx._backgroundsOpen,).toBe(true,);
    expect(calls,).toHaveLength(0,);
  });
},);

describeOrSkip("chatBackgrounds.loadBackground", () => {
  test("stores the assigned background on success", async () => {
    handler = async () => okJson(row("bg-1", "asset-1",),);
    const ctx = buildCtx("chat-1",);

    await chatBackgrounds.loadBackground!.call(ctx,);

    expect(calls.map((c,) => c.url),).toEqual(["/api/v1/chats/chat-1/background",],);
    expect(ctx._background?.asset_id,).toBe("asset-1",);
  });

  test("keeps the previous background when the request fails", async () => {
    handler = async () => errRes();
    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-old", "asset-old",);

    await chatBackgrounds.loadBackground!.call(ctx,);

    expect(ctx._background?.id,).toBe("bg-old",);
  });

  test("keeps the previous background when the request throws", async () => {
    handler = async () => {
      throw new Error("network down",);
    };

    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-old", "asset-old",);

    await chatBackgrounds.loadBackground!.call(ctx,);

    expect(ctx._background?.id,).toBe("bg-old",);
  });

  test("does nothing without an active chat", async () => {
    const ctx = buildCtx(null,);

    await chatBackgrounds.loadBackground!.call(ctx,);

    expect(calls,).toHaveLength(0,);
    expect(ctx._background,).toBeNull();
  });
},);

describeOrSkip("chatBackgrounds.loadBackgrounds", () => {
  test("loads the catalog and the chat's own assignment", async () => {
    handler = async (url,) =>
      url === "/api/v1/backgrounds" ? okJson([row("bg-1", "asset-1",),],) : okJson(row("bg-2", "asset-2",),);

    const ctx = buildCtx("chat-1",);

    await chatBackgrounds.loadBackgrounds!.call(ctx,);

    expect(calls.map((c,) => c.url),).toEqual([
      "/api/v1/backgrounds",
      "/api/v1/chats/chat-1/background",
    ],);

    expect(ctx._backgrounds.map((b,) => b.id),).toEqual(["bg-1",],);
    expect(ctx._background?.id,).toBe("bg-2",);
    expect(ctx._backgroundsLoading,).toBe(false,);
  });

  test("keeps the catalog empty and stops loading when the request fails", async () => {
    handler = async () => errRes();
    const ctx = buildCtx("chat-1",);

    await chatBackgrounds.loadBackgrounds!.call(ctx,);

    expect(ctx._backgrounds,).toEqual([],);
    expect(ctx._backgroundsLoading,).toBe(false,);
  });

  test("keeps the catalog empty and stops loading when the request throws", async () => {
    handler = async () => {
      throw new Error("network down",);
    };

    const ctx = buildCtx("chat-1",);

    await chatBackgrounds.loadBackgrounds!.call(ctx,);

    expect(ctx._backgrounds,).toEqual([],);
    expect(ctx._backgroundsLoading,).toBe(false,);
  });

  test("does nothing without an active chat", async () => {
    const ctx = buildCtx(null,);

    await chatBackgrounds.loadBackgrounds!.call(ctx,);

    expect(calls,).toHaveLength(0,);
    expect(ctx._backgroundsLoading,).toBe(false,);
  });
},);

describeOrSkip("chatBackgrounds.setBackground", () => {
  test("POSTs the chosen background and stores the result", async () => {
    handler = async () => okJson(row("bg-3", "asset-3",),);
    const ctx = buildCtx("chat-1",);

    await chatBackgrounds.setBackground!.call(ctx, "bg-3",);

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/v1/chats/chat-1/background",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    const body = JSON.parse(String(calls[0]!.opts.body,),) as { backgroundId: string };
    expect(body,).toEqual({ backgroundId: "bg-3", },);
    expect(ctx._background?.id,).toBe("bg-3",);
  });

  test("leaves the background untouched when the request fails", async () => {
    handler = async () => errRes();
    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-old", "asset-old",);

    await chatBackgrounds.setBackground!.call(ctx, "bg-3",);

    expect(ctx._background?.id,).toBe("bg-old",);
  });

  test("leaves the background untouched when the request throws", async () => {
    handler = async () => {
      throw new Error("network down",);
    };

    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-old", "asset-old",);

    await chatBackgrounds.setBackground!.call(ctx, "bg-3",);

    expect(ctx._background?.id,).toBe("bg-old",);
  });

  test("does nothing without an active chat", async () => {
    const ctx = buildCtx(null,);

    await chatBackgrounds.setBackground!.call(ctx, "bg-3",);

    expect(calls,).toHaveLength(0,);
    expect(ctx._background,).toBeNull();
  });
},);

describeOrSkip("chatBackgrounds.removeBackground", () => {
  test("clears the background on success", async () => {
    handler = async () => okJson(null,);
    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-1", "asset-1",);

    await chatBackgrounds.removeBackground!.call(ctx,);

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/v1/chats/chat-1/background",);
    expect(calls[0]!.opts.method,).toBe("DELETE",);
    expect(ctx._background,).toBeNull();
  });

  test("keeps the background when the request fails", async () => {
    handler = async () => errRes();
    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-1", "asset-1",);

    await chatBackgrounds.removeBackground!.call(ctx,);

    expect(ctx._background?.id,).toBe("bg-1",);
  });

  test("keeps the background when the request throws", async () => {
    handler = async () => {
      throw new Error("network down",);
    };

    const ctx = buildCtx("chat-1",);
    ctx._background = row("bg-1", "asset-1",);

    await chatBackgrounds.removeBackground!.call(ctx,);

    expect(ctx._background?.id,).toBe("bg-1",);
  });

  test("does nothing without an active chat", async () => {
    const ctx = buildCtx(null,);
    ctx._background = row("bg-1", "asset-1",);

    await chatBackgrounds.removeBackground!.call(ctx,);

    expect(calls,).toHaveLength(0,);
    expect(ctx._background?.id,).toBe("bg-1",);
  });
},);
