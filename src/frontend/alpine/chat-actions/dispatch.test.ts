// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the entity-update command actions: `char-update`, `item-update`.
 *
 * Both handlers confirm with the entity's NAME, PUT to the real route the
 * backend preview names, and toast through `show-toast`. The routes fail with
 * HTTP status codes (jsonError), never with a 200 `{ success: false }` body —
 * the one 200-body failure the char route can produce, `ok: false`, is covered
 * explicitly.
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { moodStateAvatars, } from "../mood/avatars";
import { dispatch, } from "./dispatch";
import { emotionAvatarActionHandlers, } from "./emotion-avatars";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

// ── Mock ../htmx (must precede importing ./dispatch) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface DispatchCtx {
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<DispatchCtx>,): DispatchCtx {
  const ctx: DispatchCtx = {
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

function withConfirm(accept: boolean, run: () => Promise<void>,): Promise<void> {
  const orig = globalThis.confirm;
  (globalThis as Record<string, unknown>).confirm = () => accept;
  return run().finally(() => {
    (globalThis as Record<string, unknown>).confirm = orig;
  },);
}

const CHAR_PAYLOAD = {
  charId: "char-1",
  name: "Iria",
  updates: { displayName: "Iria the Bold", },
  contentVersion: 4,
};

const ITEM_PAYLOAD = {
  itemId: "item-1",
  worldId: "world-1",
  name: "Iron Sword",
  updates: { value: 75, },
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("dispatch: char-update", () => {
  test("PUTs the real actor route with the version-stamped body and toasts success", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: true, contentVersion: 5, },);
    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "char-update", CHAR_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/v1/actors/char-1",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toEqual({
      displayName: "Iria the Bold",
      contentVersion: 4,
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: expect.any(String,), },],);
  });

  test("does not fetch when the confirm dialog is dismissed", async () => {
    const ctx = buildCtx();
    await withConfirm(
      false,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "char-update", CHAR_PAYLOAD, "chat-1",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("no-ops when the payload is missing required fields", async () => {
    const ctx = buildCtx();
    await dispatch.dispatchCommandAction!.call(ctx as never, "char-update", { charId: "char-1", }, "chat-1",);
    await dispatch.dispatchCommandAction!.call(ctx as never, "char-update", null, "chat-1",);

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("toasts failure on an HTTP error status", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: "Version conflict", }, { status: 409, },);
    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "char-update", CHAR_PAYLOAD, "chat-1",),
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("toasts failure on a 200 body with ok:false", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: false, },);
    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "char-update", CHAR_PAYLOAD, "chat-1",),
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("toasts failure when the fetch throws", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new TypeError("network down",);
    };

    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "char-update", CHAR_PAYLOAD, "chat-1",),
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });
},);

describeOrSkip("dispatch: generate-emotion-avatars", () => {
  const PAYLOAD = { actorId: "actor-9", baseAvatarId: "av-base", emotions: ["happy",], jobId: null, };
  const origPoll = moodStateAvatars._pollEmotionJob;

  afterEach(() => {
    moodStateAvatars._pollEmotionJob = origPoll;
  },);

  test("POSTs the regenerate route with slot replace and polls the job", async () => {
    const ctx = buildCtx();
    const seen: string[] = [];
    handler = async (url: string,) => {
      seen.push(url,);
      if (url.endsWith("/regenerate",)) { return Response.json({ jobId: "job-r1", },); }
      return Response.json({ status: "completed", },);
    };

    const polled: [string, string | null,][] = [];
    moodStateAvatars._pollEmotionJob = (async (actorId: string, jobId: string | null,) => {
      polled.push([actorId, jobId,],);
    }) as typeof moodStateAvatars._pollEmotionJob;

    await dispatch.dispatchCommandAction!.call(ctx as never, "generate-emotion-avatars", PAYLOAD, "chat-1",);

    expect(seen[0],).toBe("/api/v1/actors/actor-9/emotion-avatars/regenerate",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toEqual({
      baseAvatarId: "av-base",
      emotions: ["happy",],
      replace: "slot",
    },);

    expect(polled,).toEqual([["actor-9", "job-r1",],],);
    expect(emotionAvatarActionHandlers["generate-emotion-avatars"],).toBeDefined();
    expect(ctx.toasts[0],).toEqual({ type: "info", message: expect.any(String,), },);
  });

  test("no-ops when the payload is missing required fields", async () => {
    const ctx = buildCtx();
    await dispatch.dispatchCommandAction!.call(ctx as never, "generate-emotion-avatars", { actorId: "a", }, "chat-1",);
    await dispatch.dispatchCommandAction!.call(ctx as never, "generate-emotion-avatars", null, "chat-1",);

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("toasts failure on an HTTP error status", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "queue full", }, { status: 503, },);
    await dispatch.dispatchCommandAction!.call(ctx as never, "generate-emotion-avatars", PAYLOAD, "chat-1",);

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });
},);

describeOrSkip("dispatch: item-update (restored)", () => {
  test("PUTs the real world-item route and toasts success (restored)", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ id: "item-1", name: "Iron Sword Mk2", },);
    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "item-update", ITEM_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/v1/worlds/world-1/items/item-1",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toEqual({ value: 75, },);
    expect(ctx.toasts,).toEqual([{ type: "success", message: expect.any(String,), },],);
  });

  test("does not fetch when the confirm dialog is dismissed", async () => {
    const ctx = buildCtx();
    await withConfirm(
      false,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "item-update", ITEM_PAYLOAD, "chat-1",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("no-ops when the payload is missing required fields", async () => {
    const ctx = buildCtx();
    await dispatch.dispatchCommandAction!.call(ctx as never, "item-update", { itemId: "item-1", }, "chat-1",);
    await dispatch.dispatchCommandAction!.call(ctx as never, "item-update", null, "chat-1",);

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("toasts failure on an HTTP error status", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "Item not found", }, { status: 404, },);
    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "item-update", ITEM_PAYLOAD, "chat-1",),
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("toasts failure when the fetch throws", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new TypeError("network down",);
    };

    await withConfirm(
      true,
      () => dispatch.dispatchCommandAction!.call(ctx as never, "item-update", ITEM_PAYLOAD, "chat-1",),
    );

    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });
},);
