// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatVariants, } from "./chat-variants";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("./htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface VariantsCtx {
  messages: { id: string; content: string; variantIndex?: number; totalVariants?: number }[];
  toasts: Toast[];
  _variantsOpen: boolean;
  _variantsLoading: boolean;
  _variantsFor: string | null;
  _variants: { id: string; content: string }[];
  loadMessages?: () => Promise<void>;
  closeVariants?: () => void;
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<VariantsCtx>,): VariantsCtx {
  const ctx: VariantsCtx = {
    messages: [{ id: "m1", content: "A", variantIndex: 0, totalVariants: 2, },],
    toasts: [],
    _variantsOpen: false,
    _variantsLoading: false,
    _variantsFor: null,
    _variants: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  };
  return ctx;
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describe("chatVariants.openVariants", () => {
  test("GETs siblings and opens the browser", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json([{ id: "v1", content: "A", }, { id: "v2", content: "B", },],);
    await chatVariants.openVariants!.call(ctx as never, "m1",);
    expect(calls[0]?.url,).toBe("/api/messages/m1/variants",);
    expect(ctx._variantsOpen,).toBe(true,);
    expect(ctx._variantsFor,).toBe("m1",);
    expect(ctx._variants,).toHaveLength(2,);
    expect(ctx._variantsLoading,).toBe(false,);
  },);

  test("closes and toasts on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "nope", }, { status: 404, },);
    await chatVariants.openVariants!.call(ctx as never, "m1",);
    expect(ctx._variantsOpen,).toBe(false,);
    expect(ctx._variantsFor,).toBeNull();
    expect(ctx.toasts[0]?.type,).toBe("error",);
  },);
},);

describe("chatVariants.selectVariantByIndex", () => {
  test("PUTs stateless select and swaps bubble content locally", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ id: "v2", content: "B", },);
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 1,);
    expect(calls[0]?.url,).toBe("/api/messages/m1/variant",);
    expect(calls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ variantIndex: 1, },);
    expect(ctx.messages[0]?.content,).toBe("B",);
    expect(ctx.messages[0]?.variantIndex,).toBe(1,);
    expect(ctx._variantsOpen,).toBe(false,);
  },);

  test("toasts on invalid index without touching content", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ message: "bad", }, { status: 400, },);
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 99,);
    expect(ctx.messages[0]?.content,).toBe("A",);
    expect(ctx.toasts[0]?.type,).toBe("error",);
  },);
},);

describe("chatVariants.switchVariant", () => {
  test("routes through stateless select with wrapped index", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ id: "v2", content: "B", },);
    await chatVariants.switchVariant!.call(ctx as never, "m1", 1,);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ variantIndex: 1, },);
    expect(ctx.messages[0]?.content,).toBe("B",);
  },);
},);
