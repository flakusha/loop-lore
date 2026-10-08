// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { ApiFetchMock, Toast, } from "../tests/test-types";
import { chatBranchMerge, } from "./chat-branch-merge";
import {
  confirmMergeApi,
  continueFromMergeApi,
  initiateMergeApi,
  loadPreviewApi,
} from "./chat-branch-merge-api";
import { mergeErrorMessage, uiStore, } from "./chat-branch-merge-helpers";

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface MergeCtx {
  activeChat: string | null;
  toasts: Toast[];
  mergeStep: string;
  mergeId: string | null;
  mergeSources: { tipMessageId: string; branchId: string | null }[];
  mergeMode: string | null;
  mergePreview: unknown;
  mergePreviewLoading: boolean;
  mergeError: string | null;
  mergeConflictChoices: Map<number, "base" | "overlay" | "manual">;
  mergeDraftEdits: { role: string; content: string }[];
  mergeBranchName: string;
  mergeActivate: boolean;
  loadBranches?: () => Promise<void>;
  loadMessages?: () => Promise<void>;
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<MergeCtx>,): MergeCtx {
  // Start with methods from chatBranchMerge so `this` works correctly
  const base: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(chatBranchMerge,)) {
    const desc = Object.getOwnPropertyDescriptor(chatBranchMerge, name,);
    if (!desc) { continue; }
    if ("value" in desc) { base[name] = desc.value; }
    else { Object.defineProperty(base, name, desc,); }
  }

  const ctx: MergeCtx = {
    ...base,
    activeChat: "chat-1",
    toasts: [],
    mergeStep: "sources",
    mergeId: null,
    mergeSources: [],
    mergeMode: null,
    mergePreview: null,
    mergePreviewLoading: false,
    mergeError: null,
    mergeConflictChoices: new Map(),
    mergeDraftEdits: [],
    mergeBranchName: "",
    mergeActivate: true,
    loadBranches: async () => {},
    loadMessages: async () => {},
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  } as MergeCtx;

  return ctx;
}

const SOURCES = [
  { tipMessageId: "m1", branchId: "b1", },
  { tipMessageId: "m2", branchId: "b2", },
];

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("chatBranchMerge — wizard step transitions", () => {
  test("openBranchMerge sets step to sources and resets state", async () => {
    const ctx = buildCtx();
    await chatBranchMerge.openBranchMerge!.call(ctx as never, SOURCES,);
    expect(ctx.mergeStep,).toBe("sources",);
    expect(ctx.mergeSources,).toEqual(SOURCES,);
    expect(ctx.mergeId,).toBeNull();
    expect(ctx.mergeMode,).toBeNull();
  });

  test("closeBranchMerge resets all state", async () => {
    const ctx = buildCtx({ mergeStep: "confirm", mergeId: "mg-1", mergeMode: "combined", },);
    chatBranchMerge.closeBranchMerge!.call(ctx as never,);
    expect(ctx.mergeStep,).toBe("sources",);
    expect(ctx.mergeId,).toBeNull();
    expect(ctx.mergeMode,).toBeNull();
    expect(ctx.mergeSources,).toEqual([],);
  });

  test("initiateMerge advances to preview step on success", async () => {
    const ctx = buildCtx({ mergeSources: SOURCES, },);
    handler = async () => Response.json({ data: { mergeId: "mg-1", }, },);
    await chatBranchMerge.initiateMerge!.call(ctx as never, "combined",);
    expect(ctx.mergeId,).toBe("mg-1",);
    expect(ctx.mergeStep,).toBe("preview",);
  });

  test("initiateMerge toasts on failure and does not advance", async () => {
    const ctx = buildCtx({ mergeSources: SOURCES, },);
    handler = async () => Response.json({ error: { message: "bad", }, }, { status: 400, },);
    await chatBranchMerge.initiateMerge!.call(ctx as never, "combined",);
    expect(ctx.mergeStep,).toBe("sources",);
    expect(ctx.mergeId,).toBeNull();
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("initiateMerge requires at least 2 sources", async () => {
    const ctx = buildCtx({ mergeSources: [SOURCES[0]!,], },);
    handler = async () => Response.json({ data: { mergeId: "mg-1", }, },);
    await chatBranchMerge.initiateMerge!.call(ctx as never, "combined",);
    expect(ctx.mergeId,).toBeNull();
    expect(calls,).toHaveLength(0,);
  });
},);

describeOrSkip("chatBranchMerge — ordinal assignment", () => {
  test("reorderSource moves a source up", () => {
    const ctx = buildCtx({ mergeSources: [...SOURCES,], },);
    chatBranchMerge.reorderSource!.call(ctx as never, 1, -1,);
    expect(ctx.mergeSources[0]?.tipMessageId,).toBe("m2",);
    expect(ctx.mergeSources[1]?.tipMessageId,).toBe("m1",);
  });

  test("reorderSource moves a source down", () => {
    const ctx = buildCtx({ mergeSources: [...SOURCES,], },);
    chatBranchMerge.reorderSource!.call(ctx as never, 0, 1,);
    expect(ctx.mergeSources[0]?.tipMessageId,).toBe("m2",);
    expect(ctx.mergeSources[1]?.tipMessageId,).toBe("m1",);
  });

  test("reorderSource ignores out-of-bounds", () => {
    const ctx = buildCtx({ mergeSources: [...SOURCES,], },);
    chatBranchMerge.reorderSource!.call(ctx as never, 0, -1,);
    expect(ctx.mergeSources,).toEqual(SOURCES,);
    chatBranchMerge.reorderSource!.call(ctx as never, 1, 1,);
    expect(ctx.mergeSources,).toEqual(SOURCES,);
  });

  test("removeSource removes by index", () => {
    const ctx = buildCtx({ mergeSources: [...SOURCES,], },);
    chatBranchMerge.removeSource!.call(ctx as never, 0,);
    expect(ctx.mergeSources,).toHaveLength(1,);
    expect(ctx.mergeSources[0]?.tipMessageId,).toBe("m2",);
  });
},);

describeOrSkip("chatBranchMerge — conflict gating of confirm", () => {
  const overlayPreview = {
    mergeId: "mg-1",
    mode: "second-over-first",
    kind: "overlay",
    hunks: [
      { status: "kept", base: ["a",], overlay: ["a",], result: ["a",], },
      { status: "conflict", base: ["b",], overlay: ["c",], result: null, },
    ],
    tokenEstimate: { sharedPrefix: 0, perSource: [], },
    truncated: false,
  };

  test("canConfirm is false when overlay has unresolved conflicts", () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "second-over-first",
      mergePreview: overlayPreview,
    },);

    expect(chatBranchMerge.canConfirm!.call(ctx as never,),).toBe(false,);
  });

  test("canConfirm is true when all conflicts are resolved", () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "second-over-first",
      mergePreview: overlayPreview,
      mergeConflictChoices: new Map([[1, "base",],],),
    },);

    expect(chatBranchMerge.canConfirm!.call(ctx as never,),).toBe(true,);
  });

  test("canConfirm is false for LLM mode with no draft edits", () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "combined",
      mergePreview: { kind: "llm", draft: [], },
      mergeDraftEdits: [],
    },);

    expect(chatBranchMerge.canConfirm!.call(ctx as never,),).toBe(false,);
  });

  test("canConfirm is true for LLM mode with draft edits", () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "combined",
      mergePreview: { kind: "llm", draft: [{ role: "assistant", content: "hi", },], },
      mergeDraftEdits: [{ role: "assistant", content: "hi", },],
    },);

    expect(chatBranchMerge.canConfirm!.call(ctx as never,),).toBe(true,);
  });

  test("conflictsResolved returns true for LLM mode", () => {
    const ctx = buildCtx({ mergePreview: { kind: "llm", draft: [], }, },);
    expect(chatBranchMerge.conflictsResolved!.call(ctx as never,),).toBe(true,);
  });

  test("setConflictChoice records the resolution", () => {
    const ctx = buildCtx({ mergeConflictChoices: new Map(), },);
    chatBranchMerge.setConflictChoice!.call(ctx as never, 0, "overlay",);
    expect(ctx.mergeConflictChoices.get(0,),).toBe("overlay",);
  });
},);

describeOrSkip("chatBranchMerge — confirm and continue", () => {
  test("confirmMerge calls confirm endpoint and reloads", async () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "combined",
      mergePreview: { kind: "llm", draft: [{ role: "assistant", content: "hi", },], },
      mergeDraftEdits: [{ role: "assistant", content: "hi", },],
      mergeBranchName: "Merged 2",
      mergeActivate: true,
    },);

    handler = async () =>
      Response.json({
        data: { mergeId: "mg-1", resultMessageIds: ["r1",], mergedBranchId: "b3", activeBranchId: "b3", },
      },);

    await chatBranchMerge.confirmMerge!.call(ctx as never, "Merged 2", true,);
    expect(calls[0]?.url,).toContain("/branch-merges/mg-1/confirm",);
    expect(ctx.toasts.some((t,) => t.type === "success"),).toBe(true,);
  });

  test("confirmMerge toasts on failure", async () => {
    const ctx = buildCtx({
      mergeId: "mg-1",
      mergeMode: "combined",
      mergePreview: { kind: "llm", draft: [{ role: "assistant", content: "hi", },], },
      mergeDraftEdits: [{ role: "assistant", content: "hi", },],
    },);

    handler = async () => Response.json({ error: { message: "conflict", }, }, { status: 409, },);
    await chatBranchMerge.confirmMerge!.call(ctx as never, "Merged 2", true,);
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("continueFromMerge calls continue endpoint", async () => {
    const ctx = buildCtx({ mergeId: "mg-1", },);
    handler = async () =>
      Response.json({
        data: { id: "msg-1", context: { mergeId: "mg-1", mergedTipId: "r1", replied: true, }, },
      },);

    await chatBranchMerge.continueFromMerge!.call(ctx as never, "hello",);
    expect(calls[0]?.url,).toContain("/branch-merges/mg-1/continue",);
  });

  test("continueFromMerge toasts on failure", async () => {
    const ctx = buildCtx({ mergeId: "mg-1", },);
    handler = async () => Response.json({ error: { message: "not found", }, }, { status: 404, },);
    await chatBranchMerge.continueFromMerge!.call(ctx as never,);
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });
},);

describeOrSkip("merge helpers", () => {
  test("mergeErrorMessage extracts message from error response", async () => {
    const res = Response.json({ error: { message: "bad merge", }, }, { status: 400, },);
    const msg = await mergeErrorMessage(res,);
    expect(msg,).toBe("bad merge",);
  });

  test("mergeErrorMessage falls back to HTTP status", async () => {
    const res = Response.json({}, { status: 500, },);
    const msg = await mergeErrorMessage(res,);
    expect(msg,).toBe("HTTP 500",);
  });

  test("mergeErrorMessage handles non-JSON response", async () => {
    const res = new Response("not json", { status: 502, },);
    const msg = await mergeErrorMessage(res,);
    expect(msg,).toBe("HTTP 502",);
  });

  test("uiStore returns null when Alpine is undefined", () => {
    const realAlpine = globalThis.Alpine;
    delete (globalThis as Record<string, unknown>).Alpine;
    try {
      expect(uiStore(),).toBeNull();
    } finally {
      globalThis.Alpine = realAlpine;
    }
  });

  test("uiStore returns the ui store when Alpine is present", () => {
    const store = { mergeModalOpen: false, };
    (globalThis as Record<string, unknown>).Alpine = {
      store: (name: string,) => (name === "ui" ? store : {}),
    };

    try {
      expect(uiStore(),).toBe(store,);
    } finally {
      delete (globalThis as Record<string, unknown>).Alpine;
    }
  });
},);

describeOrSkip("merge API helpers", () => {
  test("initiateMergeApi returns mergeId on success", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ data: { mergeId: "mg-1", }, },);
    const result = await initiateMergeApi(ctx as never, { mode: "combined", sources: SOURCES, },);
    expect(result,).toBe("mg-1",);
  });

  test("initiateMergeApi returns null on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: { message: "bad", }, }, { status: 400, },);
    const result = await initiateMergeApi(ctx as never, { mode: "combined", sources: SOURCES, },);
    expect(result,).toBeNull();
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("initiateMergeApi returns null with fewer than 2 sources", async () => {
    const ctx = buildCtx();
    const result = await initiateMergeApi(ctx as never, { mode: "combined", sources: [SOURCES[0]!,], },);
    expect(result,).toBeNull();
    expect(calls,).toHaveLength(0,);
  });

  test("loadPreviewApi returns preview on success", async () => {
    const ctx = buildCtx();
    handler = async () =>
      Response.json({
        data: {
          mergeId: "mg-1",
          kind: "llm",
          draft: [],
          tokenEstimate: { sharedPrefix: 0, perSource: [], },
          truncated: false,
        },
      },);

    const result = await loadPreviewApi(ctx as never, { mergeId: "mg-1", },);
    expect(result,).not.toBeNull();
  });

  test("loadPreviewApi returns null on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: { message: "bad", }, }, { status: 500, },);
    const result = await loadPreviewApi(ctx as never, { mergeId: "mg-1", },);
    expect(result,).toBeNull();
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("confirmMergeApi returns result on success", async () => {
    const ctx = buildCtx();
    handler = async () =>
      Response.json({
        data: { mergeId: "mg-1", resultMessageIds: ["r1",], mergedBranchId: "b3", activeBranchId: "b3", },
      },);

    const result = await confirmMergeApi(ctx as never, { mergeId: "mg-1", branchName: "Merged", activate: true, },);
    expect(result,).not.toBeNull();
  });

  test("confirmMergeApi returns null on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: { message: "conflict", }, }, { status: 409, },);
    const result = await confirmMergeApi(ctx as never, { mergeId: "mg-1", branchName: "Merged", activate: true, },);
    expect(result,).toBeNull();
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("continueFromMergeApi returns result on success", async () => {
    const ctx = buildCtx();
    handler = async () =>
      Response.json({ data: { id: "msg-1", context: { mergeId: "mg-1", mergedTipId: "r1", replied: true, }, }, },);

    const result = await continueFromMergeApi(ctx as never, { mergeId: "mg-1", prompt: "hello", },);
    expect(result,).not.toBeNull();
  });

  test("continueFromMergeApi returns null on failure", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: { message: "not found", }, }, { status: 404, },);
    const result = await continueFromMergeApi(ctx as never, { mergeId: "mg-1", },);
    expect(result,).toBeNull();
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
  });
},);

describeOrSkip("chatBranchMerge — preview", () => {
  test("loadPreview fetches and stores preview", async () => {
    const ctx = buildCtx({ mergeId: "mg-1", },);
    handler = async () =>
      Response.json({
        data: {
          mergeId: "mg-1",
          mode: "combined",
          kind: "llm",
          draft: [{ role: "assistant", content: "hi", },],
          tokenEstimate: { sharedPrefix: 10, perSource: [5, 5,], },
          truncated: false,
        },
      },);

    await chatBranchMerge.loadPreview!.call(ctx as never,);
    expect(ctx.mergePreview,).not.toBeNull();
    expect(ctx.mergeDraftEdits,).toHaveLength(1,);
    expect(ctx.mergePreviewLoading,).toBe(false,);
  });

  test("loadPreview toasts on failure", async () => {
    const ctx = buildCtx({ mergeId: "mg-1", },);
    handler = async () => Response.json({ error: { message: "bad", }, }, { status: 500, },);
    await chatBranchMerge.loadPreview!.call(ctx as never,);
    expect(ctx.toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(ctx.mergePreviewLoading,).toBe(false,);
  });

  test("rerollPreview calls loadPreview with regenerate", async () => {
    const ctx = buildCtx({ mergeId: "mg-1", },);
    handler = async () =>
      Response.json({
        data: {
          mergeId: "mg-1",
          mode: "combined",
          kind: "llm",
          draft: [],
          tokenEstimate: { sharedPrefix: 0, perSource: [], },
          truncated: false,
        },
      },);

    await chatBranchMerge.rerollPreview!.call(ctx as never,);
    const body = calls[0]?.opts.body as string;
    expect(body,).toContain("regenerate",);
  });
},);

describeOrSkip("chatBranchMerge — default branch name", () => {
  test("defaultBranchName returns Merged + count", () => {
    const ctx = buildCtx({ mergeSources: SOURCES, },);
    expect(chatBranchMerge.defaultBranchName!.call(ctx as never,),).toBe("Merged 2",);
  });
},);
