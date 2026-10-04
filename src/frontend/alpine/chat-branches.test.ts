// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatBranches, } from "./chat-branches";
import type { ChatState, } from "./types";

// ── Mock apiFetch (chat-branches imports htmx + i18n) ──
// i18n uses the REAL module via i18n.test-helper above — do NOT mock.module
// "./i18n" here: mock.module is process-global, so a `t:key => key` stub leaks
// into sibling test files sharing the worker (mirrors chat-side-channels.test.ts).
// The stub ALSO mirrors feFetch, which REJECTS on any non-2xx — the module
// under test relies on that contract, so returning a bare 500 Response would
// make every error path unreachable.
let fetchCalls: { url: string; args: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, args: opts ?? {}, },);
      const res = fetchHandler ? fetchHandler(url, opts ?? {},) : new Response("{}", {
        status: 200,
      },);

      if (!res.ok) { throw new Error(`HTTP ${res.status}`,); }
      return res;
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

// Alpine store stub — branches reads/writes $store.ui outside the browser.
const uiStore: Record<string, unknown> = { branches: [], showBranchMenu: false, };
(globalThis as Record<string, unknown>).Alpine = {
  store: (name: string,) => (name === "ui" ? uiStore : {}),
};

interface Toast {
  type: string;
  message: string;
}

/**
 * @param overrides
 * @param overrides.activeChat
 * @param overrides.toasts
 */
function buildCtx(
  overrides: { activeChat?: string | null; toasts?: Toast[] } = {},
): ChatState {
  const toasts: Toast[] = overrides.toasts ?? [];
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat === undefined ? "chat-1" : overrides.activeChat,
    currentChat: { id: "chat-1", type: "direct", name: "Chat", },
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };

  for (const name of Object.getOwnPropertyNames(chatBranches,)) {
    const desc = Object.getOwnPropertyDescriptor(chatBranches, name,);
    if (!desc) { continue; }
    if ("value" in desc) { base[name] = desc.value; }
    else { Object.defineProperty(base, name, desc,); }
  }

  return base as unknown as ChatState;
}

const originalPrompt = globalThis.prompt;

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  globalThis.prompt = originalPrompt;
  uiStore.branches = [];
  uiStore.showBranchMenu = false;
},);

const BRANCH = {
  id: "b1",
  chatId: "chat-1",
  parentMessageId: "m1",
  name: "Branch 1",
  createdAt: "2026-10-01T00:00:00Z",
  isActive: true,
  messageCount: 3,
  lastActivity: null,
};

describeOrSkip("chatBranches — loadBranches", () => {
  test("fetches every branch in one page into $store.ui.branches", async () => {
    mockFetch(200, { data: { branches: [BRANCH,], nextCursor: null, }, },);
    await chatBranches.loadBranches!.call(buildCtx(),);
    // limit=100 is load-bearing: the list route defaults to a 20-row page and
    // the dropdown/panel render the array wholesale, so the default would
    // silently hide branches past the 20th.
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/branches?limit=100",);
    expect(uiStore.branches,).toEqual([BRANCH,],);
  });

  test("stores an empty list when the payload has no branches key", async () => {
    mockFetch(200, { data: {}, },);
    await chatBranches.loadBranches!.call(buildCtx(),);
    expect(uiStore.branches,).toEqual([],);
  });

  test("no-ops without an active chat", async () => {
    await chatBranches.loadBranches!.call(buildCtx({ activeChat: null, },),);
    expect(fetchCalls,).toEqual([],);
  });

  test("toasts an error on an HTTP failure", async () => {
    mockFetch(500,);
    const toasts: Toast[] = [];
    await chatBranches.loadBranches!.call(buildCtx({ toasts, },),);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("toasts an error on a network failure", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const toasts: Toast[] = [];
    await chatBranches.loadBranches!.call(buildCtx({ toasts, },),);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
  });

  test("a slow response for the previous chat never overwrites the current chat's branches", async () => {
    // Out-of-order fetch race: chat A's list resolves AFTER the user switched
    // to chat B. Writing it would hand the user A's branches — which they can
    // then delete or merge — while looking at B.
    const bBranch = { ...BRANCH, id: "b9", chatId: "chat-2", };
    uiStore.branches = [bBranch,];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    fetchHandler = () => {
      const res = Response.json({ data: { branches: [BRANCH,], }, }, { status: 200, },);
      // Hold the body open so the chat switch lands mid-flight.
      res.json = async () => {
        await gate;
        return { data: { branches: [BRANCH,], }, };
      };

      return res;
    };

    const ctx = buildCtx({ activeChat: "chat-1", },);
    const pending = chatBranches.loadBranches!.call(ctx,);
    ctx.activeChat = "chat-2";
    release();
    await pending;
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/branches?limit=100",);
    expect(uiStore.branches,).toEqual([bBranch,],);
  });

  test("a stale chat's failure does not toast over the current chat", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    fetchHandler = () => {
      const res = new Response("{}", { status: 200, },);
      res.json = async () => {
        await gate;
        throw new Error("offline",);
      };

      return res;
    };

    const toasts: Toast[] = [];
    const ctx = buildCtx({ toasts, },);
    const pending = chatBranches.loadBranches!.call(ctx,);
    ctx.activeChat = "chat-2";
    release();
    await pending;
    expect(toasts,).toEqual([],);
  });
},);

describeOrSkip("chatBranches — forkFromMessage", () => {
  test("aborts without a request when the prompt is cancelled", async () => {
    globalThis.prompt = (() => null) as typeof prompt;
    await chatBranches.forkFromMessage!.call(buildCtx(), "m1",);
    expect(fetchCalls,).toEqual([],);
  });

  test("POSTs the fork with the prompted name, then reloads", async () => {
    globalThis.prompt = (() => "Alt path") as typeof prompt;
    mockFetch(201, { data: { branch: { id: "b2", }, }, },);
    const toasts: Toast[] = [];
    await chatBranches.forkFromMessage!.call(buildCtx({ toasts, },), "m1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/fork",);
    expect(fetchCalls[0]?.args.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]?.args.body as string,),).toEqual({
      messageId: "m1",
      name: "Alt path",
    },);

    expect(fetchCalls[1]?.url,).toBe("/api/v1/chats/chat-1/branches?limit=100",);
    expect(toasts.some((t,) => t.type === "success"),).toBe(true,);
  });

  test("omits the name when the user submits an empty prompt", async () => {
    globalThis.prompt = (() => "   ") as typeof prompt;
    mockFetch(201, { data: {}, },);
    await chatBranches.forkFromMessage!.call(buildCtx(), "m1",);
    expect(JSON.parse(fetchCalls[0]?.args.body as string,),).toEqual({ messageId: "m1", },);
  });

  test("takes an explicit name without prompting", async () => {
    const asked = mock(() => null as string | null);
    globalThis.prompt = asked as unknown as typeof prompt;
    mockFetch(201, { data: {}, },);
    await chatBranches.forkFromMessage!.call(buildCtx(), "m1", "Given",);
    expect(asked,).not.toHaveBeenCalled();
    expect(JSON.parse(fetchCalls[0]?.args.body as string,),).toEqual({
      messageId: "m1",
      name: "Given",
    },);
  });

  test("toasts an error when the fork fails", async () => {
    globalThis.prompt = (() => "Alt") as typeof prompt;
    mockFetch(404,);
    const toasts: Toast[] = [];
    await chatBranches.forkFromMessage!.call(buildCtx({ toasts, },), "m1",);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("no-ops without a message id", async () => {
    await chatBranches.forkFromMessage!.call(buildCtx(), "",);
    expect(fetchCalls,).toEqual([],);
  });
},);

describeOrSkip("chatBranches — switchBranch", () => {
  test("PATCHes active-branch, closes the menu, then reloads", async () => {
    uiStore.showBranchMenu = true;
    mockFetch(200, { data: { activeBranchId: "b1", }, },);
    const toasts: Toast[] = [];
    await chatBranches.switchBranch!.call(buildCtx({ toasts, },), "b1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/active-branch",);
    expect(fetchCalls[0]?.args.method,).toBe("PATCH",);
    expect(JSON.parse(fetchCalls[0]?.args.body as string,),).toEqual({ branchId: "b1", },);
    expect(uiStore.showBranchMenu,).toBe(false,);
    expect(fetchCalls[1]?.url,).toContain("/branches",);
    expect(toasts.some((t,) => t.type === "success"),).toBe(true,);
  });

  test("toasts an error and skips the reload when the switch fails", async () => {
    mockFetch(404,);
    const toasts: Toast[] = [];
    await chatBranches.switchBranch!.call(buildCtx({ toasts, },), "missing",);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("no-ops without an active chat", async () => {
    await chatBranches.switchBranch!.call(buildCtx({ activeChat: null, },), "b1",);
    expect(fetchCalls,).toEqual([],);
  });
},);

describeOrSkip("chatBranches — deleteBranch", () => {
  test("DELETEs the branch, reloads, and toasts success", async () => {
    mockFetch(200, { data: { deletedBranchId: "b1", }, },);
    const toasts: Toast[] = [];
    await chatBranches.deleteBranch!.call(buildCtx({ toasts, },), "b1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/branches/b1",);
    expect(fetchCalls[0]?.args.method,).toBe("DELETE",);
    expect(fetchCalls[1]?.url,).toBe("/api/v1/chats/chat-1/branches?limit=100",);
    expect(toasts.some((t,) => t.type === "success"),).toBe(true,);
  });

  test("toasts an error and skips the reload when the delete fails", async () => {
    mockFetch(403,);
    const toasts: Toast[] = [];
    await chatBranches.deleteBranch!.call(buildCtx({ toasts, },), "b1",);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("no-ops without a branch id", async () => {
    await chatBranches.deleteBranch!.call(buildCtx(), "",);
    expect(fetchCalls,).toEqual([],);
  });
},);

describeOrSkip("chatBranches — mergeBranch", () => {
  test("POSTs the merge, reloads, and toasts success", async () => {
    mockFetch(200, { data: { deletedSourceBranchId: "b1", }, },);
    const toasts: Toast[] = [];
    await chatBranches.mergeBranch!.call(buildCtx({ toasts, },), "b1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/branches/b1/merge",);
    expect(fetchCalls[0]?.args.method,).toBe("POST",);
    expect(fetchCalls[1]?.url,).toBe("/api/v1/chats/chat-1/branches?limit=100",);
    expect(toasts.some((t,) => t.type === "success"),).toBe(true,);
  });

  test("toasts an error and skips the reload when the merge fails", async () => {
    mockFetch(409,);
    const toasts: Toast[] = [];
    await chatBranches.mergeBranch!.call(buildCtx({ toasts, },), "b1",);
    expect(toasts.some((t,) => t.type === "error"),).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("no-ops without a branch id", async () => {
    await chatBranches.mergeBranch!.call(buildCtx(), "",);
    expect(fetchCalls,).toEqual([],);
  });
},);

describeOrSkip("chatBranches — branchCountFor", () => {
  test("counts branches forked at the message", async () => {
    uiStore.branches = [BRANCH, { ...BRANCH, id: "b2", }, { ...BRANCH, id: "b3", },];
    expect(chatBranches.branchCountFor!.call(buildCtx(), "m1",),).toBe(3,);
  });

  test("returns 0 when no branch forks there", async () => {
    uiStore.branches = [BRANCH,];
    expect(chatBranches.branchCountFor!.call(buildCtx(), "other",),).toBe(0,);
  });

  test("returns 0 with an empty store", () => {
    expect(chatBranches.branchCountFor!.call(buildCtx(), "m1",),).toBe(0,);
  });
},);

describeOrSkip("chatBranches — toggleBranches", () => {
  test("opens the dropdown and loads branches", async () => {
    mockFetch(200, { data: { branches: [], }, },);
    chatBranches.toggleBranches!.call(buildCtx(),);
    expect(uiStore.showBranchMenu,).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
  });

  test("closes the dropdown without loading", async () => {
    uiStore.showBranchMenu = true;
    chatBranches.toggleBranches!.call(buildCtx(),);
    expect(uiStore.showBranchMenu,).toBe(false,);
    expect(fetchCalls,).toEqual([],);
  });
},);

/**
 * The branch UI renders OUTSIDE the chatState x-data scope (header dropdown,
 * branch panel), so every action must also exist as a window global. Without
 * the chatState scope mounted the globals must no-op instead of throwing.
 */
describeOrSkip("branch header globals", () => {
  const g = globalThis as Record<string, unknown>;

  test("every pinned global is a callable function", () => {
    for (
      const name of [
        "loadBranches",
        "forkFromMessage",
        "switchBranch",
        "deleteBranch",
        "mergeBranch",
        "toggleBranches",
        "branchCountFor",
      ]
    ) {
      expect(typeof g[name],).toBe("function",);
    }
  });

  test("globals forward their arguments to the chatState actions", async () => {
    const calls: { name: string; args: unknown[] }[] = [];
    const el = {};
    const realAlpine = g.Alpine;
    const realDocument = g.document;
    g.document = {
      querySelector: () => el,
    } as unknown as Document;

    g.Alpine = {
      store: () => ({}),
      $data: (e: unknown,) =>
        e === el
          ? {
            loadBranches: () => calls.push({ name: "loadBranches", args: [], },),
            forkFromMessage: (...a: unknown[]) => calls.push({ name: "fork", args: a, },),
            switchBranch: (...a: unknown[]) => calls.push({ name: "switch", args: a, },),
            deleteBranch: (...a: unknown[]) => calls.push({ name: "delete", args: a, },),
            mergeBranch: (...a: unknown[]) => calls.push({ name: "merge", args: a, },),
            toggleBranches: () => calls.push({ name: "toggle", args: [], },),
            branchCountFor: (id: string,) => {
              calls.push({ name: "count", args: [id,], },);
              return 2;
            },
          }
          : {},
    };

    try {
      await (g.loadBranches as () => Promise<void>)();
      await (g.forkFromMessage as (id: string, n?: string,) => Promise<void>)("m1", "Alt",);
      await (g.switchBranch as (id: string,) => Promise<void>)("b1",);
      await (g.deleteBranch as (id: string,) => Promise<void>)("b1",);
      await (g.mergeBranch as (id: string,) => Promise<void>)("b1",);
      (g.toggleBranches as () => void)();
      expect((g.branchCountFor as (id: string,) => number | undefined)("m1",),).toBe(2,);
      expect(calls,).toEqual([
        { name: "loadBranches", args: [], },
        { name: "fork", args: ["m1", "Alt",], },
        { name: "switch", args: ["b1",], },
        { name: "delete", args: ["b1",], },
        { name: "merge", args: ["b1",], },
        { name: "toggle", args: [], },
        { name: "count", args: ["m1",], },
      ],);
    } finally {
      g.document = realDocument;
      g.Alpine = realAlpine;
    }
  });

  test("globals no-op when the chatState scope is absent", async () => {
    const realDocument = g.document;
    const realAlpine = g.Alpine;
    g.document = { querySelector: () => null, } as unknown as Document;
    try {
      await (g.loadBranches as () => Promise<void>)();
      (g.toggleBranches as () => void)();
      (g.branchCountFor as (id: string,) => number | undefined)("m1",);
      await (g.mergeBranch as (id: string,) => Promise<void>)("b1",);
    } finally {
      g.document = realDocument;
      g.Alpine = realAlpine;
    }
  });
},);
