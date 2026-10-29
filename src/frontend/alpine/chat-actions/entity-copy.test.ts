// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the B5 copy/adapt confirm handlers: `duplicate-entity` and
 * `adapt-entity`. Both confirm with the entity's NAME, POST the previewed
 * fields to the create-entity confirm route, and toast through `show-toast`.
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { entityCopyActionHandlers, } from "./entity-copy";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

// ── Mock ../htmx (must precede importing ./entity-copy) ──
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

interface CopyCtx {
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<CopyCtx>,): CopyCtx {
  const ctx: CopyCtx = {
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

function withConfirm(accept: boolean, run: () => Promise<void> | void,): Promise<void> {
  const orig = globalThis.confirm;
  (globalThis as Record<string, unknown>).confirm = () => accept;

  return (async () => run())().finally(() => {
    (globalThis as Record<string, unknown>).confirm = orig;
  },);
}

const DUPLICATE_PAYLOAD = {
  kind: "character",
  name: "Iria",
  worldId: "world-1",
  fields: { personality: "Bold", },
};

const ADAPT_PAYLOAD = {
  kind: "location",
  sourceName: "Old Tavern",
  targetWorldId: "world-2",
  fields: { description: "A tavern reimagined", },
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("entity-copy: duplicate-entity", () => {
  test("POSTs the previewed fields to the create-entity route and toasts success", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: true, },);
    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, DUPLICATE_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/chats/chat-1/create-entity",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toEqual({
      kind: "character",
      data: { personality: "Bold", },
      worldId: "world-1",
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: expect.any(String,), },],);
  });

  test("toasts an error when the server rejects the duplicate", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: "denied", }, { status: 403, },);
    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, DUPLICATE_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("toasts an error when the network fails", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };

    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, DUPLICATE_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("does not fetch when the confirm dialog is dismissed", async () => {
    const ctx = buildCtx();
    await withConfirm(
      false,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, DUPLICATE_PAYLOAD, "chat-1",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("no-ops when the payload is missing required fields", async () => {
    const ctx = buildCtx();
    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, { kind: "character", }, "chat-1",),
    );

    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, null, "chat-1",),
    );

    await withConfirm(
      true,
      () => entityCopyActionHandlers["duplicate-entity"]!(ctx as never, DUPLICATE_PAYLOAD, "",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });
},);

describeOrSkip("entity-copy: adapt-entity", () => {
  test("POSTs the adapted fields to the target world and toasts success", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: true, },);
    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, ADAPT_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/chats/chat-1/create-entity",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toEqual({
      kind: "location",
      data: { description: "A tavern reimagined", },
      worldId: "world-2",
    },);

    expect(ctx.toasts,).toEqual([{ type: "success", message: expect.any(String,), },],);
  });

  test("toasts an error when the server rejects the adapt", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: "denied", }, { status: 403, },);
    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, ADAPT_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("toasts an error when the network fails", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };

    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, ADAPT_PAYLOAD, "chat-1",),
    );

    expect(calls,).toHaveLength(1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: expect.any(String,), },],);
  });

  test("does not fetch when the confirm dialog is dismissed", async () => {
    const ctx = buildCtx();
    await withConfirm(
      false,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, ADAPT_PAYLOAD, "chat-1",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });

  test("no-ops when the payload is missing required fields", async () => {
    const ctx = buildCtx();
    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, { kind: "location", }, "chat-1",),
    );

    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, null, "chat-1",),
    );

    await withConfirm(
      true,
      () => entityCopyActionHandlers["adapt-entity"]!(ctx as never, ADAPT_PAYLOAD, "",),
    );

    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([],);
  });
},);
