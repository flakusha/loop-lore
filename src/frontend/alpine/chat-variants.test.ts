// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { chatVariants, } from "./chat-variants";

import type { ApiFetchMock, Toast, } from "../tests/test-types";

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
  activeChat: string | null;
  isGenerating: boolean;
  isContinuing: boolean;
  continuingMessageId: string | null;
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
    activeChat: "c1",
    isGenerating: false,
    isContinuing: false,
    continuingMessageId: null,
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

// ── Fake DOM: `continueMessage` resolves the originating bubble via
// `document.querySelector` + `CSS.escape`, neither of which exists in bun test.
const domHost = globalThis as unknown as {
  CSS?: unknown;
  document?: { querySelector: (selector: string,) => unknown };
};
const realDocument = domHost.document;
const realCss = domHost.CSS;
let messageEl: { dataset: { actorId?: string }; classList: { add: (name: string,) => void } } | null = null;

beforeEach(() => {
  domHost.CSS = { escape: (value: string,) => value, };
  domHost.document = { querySelector: () => messageEl, };
},);

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  domHost.document = realDocument;
  domHost.CSS = realCss;
  messageEl = null;
},);

describe("chatVariants.openVariants", () => {
  test("GETs siblings and opens the browser", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json([{ id: "v1", content: "A", }, { id: "v2", content: "B", },],);
    await chatVariants.openVariants!.call(ctx as never, "m1",);
    expect(calls[0]?.url,).toBe("/api/v1/messages/m1/variants",);
    expect(ctx._variantsOpen,).toBe(true,);
    expect(ctx._variantsFor,).toBe("m1",);
    expect(ctx._variants,).toHaveLength(2,);
    expect(ctx._variantsLoading,).toBe(false,);
  });

  test("closes and toasts on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "nope", }, { status: 404, },);
    await chatVariants.openVariants!.call(ctx as never, "m1",);
    expect(ctx._variantsOpen,).toBe(false,);
    expect(ctx._variantsFor,).toBeNull();
    expect(ctx.toasts[0]?.type,).toBe("error",);
  });
});

describe("chatVariants.selectVariantByIndex", () => {
  test("PUTs stateless select and swaps bubble content locally", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ id: "v2", content: "B", },);
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 1,);
    expect(calls[0]?.url,).toBe("/api/v1/messages/m1/variant",);
    expect(calls[0]?.opts.method,).toBe("PUT",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ variantIndex: 1, },);
    expect(ctx.messages[0]?.content,).toBe("B",);
    expect(ctx.messages[0]?.variantIndex,).toBe(1,);
    expect(ctx._variantsOpen,).toBe(false,);
  });

  test("toasts on invalid index without touching content", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ message: "bad", }, { status: 400, },);
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 99,);
    expect(ctx.messages[0]?.content,).toBe("A",);
    expect(ctx.toasts[0]?.type,).toBe("error",);
  });

  test("reloads the list when the server returns no content", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    let reloads = 0;
    ctx.loadMessages = async () => {
      reloads++;
    };
    handler = async () => Response.json({ id: "v2", },);
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 1,);
    expect(reloads,).toBe(1,);
    expect(ctx.messages[0]?.content,).toBe("A",);
    expect(ctx._variantsOpen,).toBe(false,);
  });

  test("toasts when the PUT itself fails", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => {
      throw new Error("offline",);
    };
    await chatVariants.selectVariantByIndex!.call(ctx as never, "m1", 1,);
    expect(ctx.toasts[0]?.type,).toBe("error",);
  });
});

describe("chatVariants.closeVariants", () => {
  test("clears the browser state", () => {
    const ctx = buildCtx({
      _variantsOpen: true,
      _variantsLoading: true,
      _variantsFor: "m1",
      _variants: [{ id: "v1", content: "A", },],
    },);
    chatVariants.closeVariants!.call(ctx as never,);
    expect(ctx._variantsOpen,).toBe(false,);
    expect(ctx._variantsLoading,).toBe(false,);
    expect(ctx._variantsFor,).toBeNull();
    expect(ctx._variants,).toEqual([],);
  });
});

describe("chatVariants.switchVariant", () => {
  test("routes through stateless select with wrapped index", async () => {
    const ctx = buildCtx();
    Object.assign(ctx, chatVariants,);
    handler = async () => Response.json({ id: "v2", content: "B", },);
    await chatVariants.switchVariant!.call(ctx as never, "m1", 1,);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ variantIndex: 1, },);
    expect(ctx.messages[0]?.content,).toBe("B",);
  });
});

describe("chatVariants.regenerateResponse", () => {
  test("warns and skips the request without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatVariants.regenerateResponse!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: "No active chat", },],);
  });

  test("POSTs the chat and toasts when the server is ready", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ready: true, },);
    await chatVariants.regenerateResponse!.call(ctx as never,);
    expect(calls[0]?.url,).toBe("/api/v1/generation/regenerate",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ chatId: "c1", },);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "Regenerating response...", },],);
  });

  test("stays silent when the server is not ready", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ready: false, },);
    await chatVariants.regenerateResponse!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("toasts on network failure", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };
    await chatVariants.regenerateResponse!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to regenerate", },],);
  });
});

describe("chatVariants.regenerateVariant", () => {
  test("ignores the click without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatVariants.regenerateVariant!.call(ctx as never, "m1",);
    expect(calls,).toEqual([],);
    expect(ctx.isGenerating,).toBe(false,);
  });

  test("reloads messages and clears the generating flag", async () => {
    const ctx = buildCtx();
    let reloads = 0;
    ctx.loadMessages = async () => {
      reloads++;
    };
    handler = async () => Response.json({ ok: true, },);
    await chatVariants.regenerateVariant!.call(ctx as never, "m1",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ chatId: "c1", messageId: "m1", },);
    expect(reloads,).toBe(1,);
    expect(ctx.isGenerating,).toBe(false,);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "New variant generated", },],);
  });

  test("toasts and clears the flag on network failure", async () => {
    const ctx = buildCtx();
    ctx.loadMessages = async () => {};
    handler = async () => {
      throw new Error("offline",);
    };
    await chatVariants.regenerateVariant!.call(ctx as never, "m1",);
    expect(ctx.isGenerating,).toBe(false,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Failed to regenerate variant", },],);
  });
});

describe("chatVariants.continueMessage", () => {
  test("warns without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatVariants.continueMessage!.call(ctx as never, "m1",);
    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: "No active chat", },],);
  });

  test("POSTs the bubble's actor id and marks the message continued", async () => {
    const ctx = buildCtx();
    const classes: string[] = [];
    messageEl = { dataset: { actorId: "actor-7", }, classList: { add: (name: string,) => classes.push(name,), }, };
    handler = async () => Response.json({ ok: true, },);
    await chatVariants.continueMessage!.call(ctx as never, "m1",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({
      messageId: "m1",
      chatId: "c1",
      actorId: "actor-7",
    },);
    expect(classes,).toEqual(["continued",],);
    expect(ctx.continuingMessageId,).toBe("m1",);
    expect(ctx.isContinuing,).toBe(true,);
    expect(ctx.isGenerating,).toBe(true,);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "Continuing message...", },],);
  });

  test("falls back to the unknown actor and surfaces the server error", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: false, error: "busy", },);
    await chatVariants.continueMessage!.call(ctx as never, "m1",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({
      messageId: "m1",
      chatId: "c1",
      actorId: "unknown",
    },);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "busy", },],);
    expect(ctx.isContinuing,).toBe(false,);
  });

  test("toasts on network failure", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };
    await chatVariants.continueMessage!.call(ctx as never, "m1",);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Network error continuing message", },],);
  });
});

describe("chatVariants.retryFromPoint", () => {
  test("warns without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await chatVariants.retryFromPoint!.call(ctx as never, "a1", 1,);
    expect(calls,).toEqual([],);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: "No active chat", },],);
  });

  test("announces the resume step reported by the server", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: true, resumeFromStep: 2, totalSteps: 5, },);
    await chatVariants.retryFromPoint!.call(ctx as never, "a1", 1,);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ chatId: "c1", attemptId: "a1", step: 1, },);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "Resuming from step 3 of 5...", },],);
    expect(ctx.isGenerating,).toBe(true,);
  });

  test("uses the plain regenerating status when restarting from step 0", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: true, resumeFromStep: 0, totalSteps: 3, },);
    await chatVariants.retryFromPoint!.call(ctx as never, "a1", 1,);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "Regenerating response...", },],);
  });

  test("surfaces the server error", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ ok: false, error: "no attempt", },);
    await chatVariants.retryFromPoint!.call(ctx as never, "a1", 1,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "no attempt", },],);
    expect(ctx.isGenerating,).toBe(false,);
  });

  test("toasts on network failure", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };
    await chatVariants.retryFromPoint!.call(ctx as never, "a1", 1,);
    expect(ctx.toasts[0]?.type,).toBe("error",);
  });
});
