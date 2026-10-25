// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatActions, } from "./chat-actions";

/**
 * Dispatch tests for the B4 modification and import actions:
 * modify-entity, import-entity. Each handler must call the REAL backend
 * route the preview documents, ask for confirmation naming the ENTITY, and
 * toast through the shared i18n keys.
 */

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

type DispatchCtx = Parameters<NonNullable<typeof chatActions.dispatchCommandAction>>[0];

async function dispatch(ctx: unknown, action: string, payload: Record<string, unknown> | null,) {
  // The handler only reads `$dispatch` off the chat state; the test context
  // provides exactly that, so the cast is confined to this one call.
  await chatActions.dispatchCommandAction!.call(ctx as unknown as DispatchCtx, action, payload, "chat-1",);
}

describeOrSkip("dispatchCommandAction modify-entity", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean,) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = () => value;
  }

  test("confirmed character modify PUTs to /api/v1/actors/:aid with the content version", async () => {
    confirmWith(true,);
    fetchHandler = () => Response.json({ ok: true, }, { status: 200, },);
    const ctx = buildCtx();
    await dispatch(ctx, "modify-entity", {
      kind: "character",
      entityId: "a1",
      worldId: "w1",
      name: "Rin",
      updates: { description: "A ranger who keeps her secrets", },
      contentVersion: 3,
    },);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/a1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({
      description: "A ranger who keeps her secrets",
      contentVersion: 3,
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: "Changes applied to Rin", },],);
  });

  test("confirmed location modify PUTs to /api/v1/worlds/:wid/locations/:lid", async () => {
    confirmWith(true,);
    fetchHandler = () => Response.json({ ok: true, }, { status: 200, },);
    const ctx = buildCtx();
    await dispatch(ctx, "modify-entity", {
      kind: "location",
      entityId: "loc-1",
      worldId: "w1",
      name: "Ash Gate",
      updates: { name: "Gloomy Gate", },
    },);

    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/w1/locations/loc-1",);
    expect(fetchCalls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ name: "Gloomy Gate", },);
  });

  test("a cancelled modification sends nothing at all", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await dispatch(ctx, "modify-entity", {
      kind: "character",
      entityId: "a1",
      name: "Rin",
      updates: { description: "nope", },
    },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("a failed modification toasts an error", async () => {
    confirmWith(true,);
    fetchHandler = () => Response.json({ error: "boom", }, { status: 500, },);
    const ctx = buildCtx();
    await dispatch(ctx, "modify-entity", {
      kind: "character",
      entityId: "a1",
      name: "Rin",
      updates: { description: "nope", },
    },);

    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to apply changes to Rin", },],);
  });
},);

describeOrSkip("dispatchCommandAction import-entity", () => {
  const priorConfirm = (globalThis as { confirm?: (message?: string,) => boolean }).confirm;
  afterEach(() => {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = priorConfirm;
  },);

  function confirmWith(value: boolean,) {
    (globalThis as { confirm?: (message?: string,) => boolean }).confirm = () => value;
  }

  test("confirmed import reads the raw asset and posts it to the import route", async () => {
    confirmWith(true,);
    fetchHandler = (url,) => {
      if (url.endsWith("/raw",)) {
        return new Response(new Uint8Array([104, 105,],), { status: 200, },);
      }

      return Response.json({ id: "actor-1", }, { status: 201, },);
    };

    const ctx = buildCtx();
    await dispatch(ctx, "import-entity", {
      assetId: "asset-1",
      filename: "rin.json",
      name: "Rin",
    },);

    expect(fetchCalls.length,).toBe(2,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/assets/asset-1/raw",);
    expect(fetchCalls[1]?.url,).toBe("/api/v1/actors/import",);
    expect(fetchCalls[1]?.opts.method,).toBe("POST",);
    const form = fetchCalls[1]?.opts.body as FormData;
    expect(form,).toBeInstanceOf(FormData,);
    expect((form.get("file",) as File).name,).toBe("rin.json",);
    expect(ctx.toasts,).toEqual([{ type: "success", message: "Rin imported", },],);
  });

  test("a cancelled import fetches nothing", async () => {
    confirmWith(false,);
    const ctx = buildCtx();
    await dispatch(ctx, "import-entity", {
      assetId: "asset-1",
      filename: "rin.json",
      name: "Rin",
    },);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("an unreadable asset toasts an error and never posts", async () => {
    confirmWith(true,);
    fetchHandler = () => Response.json({ error: "missing", }, { status: 404, },);
    const ctx = buildCtx();
    await dispatch(ctx, "import-entity", {
      assetId: "asset-1",
      filename: "rin.json",
      name: "Rin",
    },);

    expect(fetchCalls.length,).toBe(1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to import Rin", },],);
  });
},);
