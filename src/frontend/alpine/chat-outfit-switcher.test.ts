// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import "./chat-outfit-switcher";

type SwitcherState = {
  chatId: string | null;
  actorId: string | null;
  outfits: { id: string; name: string }[];
  overrideId: string | null;
  loading: boolean;
  saving: boolean;
  error: string;
  open: boolean;
  currentLabel: string;
  load(): Promise<void>;
  select(outfitId: string | null,): Promise<void>;
  init(): void;
  destroy(): void;
};

const factory = (globalThis as unknown as { outfitSwitcher?: () => SwitcherState }).outfitSwitcher!;

function fresh(): SwitcherState {
  return factory();
}

// ── Mock apiFetch (chat-outfit-switcher imports htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return Response.json({},); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describeOrSkip("outfitSwitcher.load", () => {
  test("fetches wardrobe + override when chat and actor resolve", async () => {
    const s = fresh();
    mockChatScope("c1", "a1",);
    fetchHandler = (url,) => url.includes("/wardrobe-override/")
      ? Response.json({ outfit_id: "o2", },)
      : Response.json([{ id: "o1", name: "Travel Cloak", }, { id: "o2", name: "Court Dress", },],);
    await s.load();
    expect(s.chatId,).toBe("c1",);
    expect(s.actorId,).toBe("a1",);
    expect(s.overrideId,).toBe("o2",);
    expect(s.outfits,).toHaveLength(2,);
    expect(s.loading,).toBe(false,);
    expect(fetchCalls.map((c,) => c.url,),).toEqual([
      "/api/v1/actors/a1/wardrobe",
      "/api/v1/chats/c1/wardrobe-override/a1",
    ],);
  });

  test("no active chat clears state without fetching", async () => {
    const s = fresh();
    mockChatScope(null, null,);
    await s.load();
    expect(fetchCalls,).toHaveLength(0,);
    expect(s.outfits,).toEqual([],);
    expect(s.overrideId,).toBeNull();
  });

  test("network failure sets error and stops loading", async () => {
    const s = fresh();
    mockChatScope("c1", "a1",);
    fetchHandler = () => {
      throw new Error("boom",);
    };
    await s.load();
    expect(s.error,).not.toBe("",);
    expect(s.loading,).toBe(false,);
  });

  test("override fetch failing leaves overrideId null", async () => {
    const s = fresh();
    mockChatScope("c1", "a1",);
    fetchHandler = (url,) => url.includes("/wardrobe-override/")
      ? Response.json({}, { status: 500, },)
      : Response.json([{ id: "o1", name: "Cloak", },],);
    await s.load();
    expect(s.outfits,).toHaveLength(1,);
    expect(s.overrideId,).toBeNull();
  });
});

describeOrSkip("outfitSwitcher.select", () => {
  test("persists override and updates state", async () => {
    const s = fresh();
    mockChatScope("c1", "a1",);
    await s.load().catch(() => undefined,);
    s.chatId = "c1";
    s.actorId = "a1";
    s.open = true;
    fetchHandler = () => Response.json({ outfit_id: "o9", },);
    await s.select("o9",);
    const put = fetchCalls.find((c,) => c.opts.method === "PUT",);
    expect(put?.url,).toBe("/api/v1/chats/c1/wardrobe-override",);
    expect(JSON.parse(put!.opts.body as string,),).toEqual({
      actor_id: "a1",
      outfit_id: "o9",
    },);
    expect(s.overrideId,).toBe("o9",);
    expect(s.open,).toBe(false,);
    expect(s.saving,).toBe(false,);
  });

  test("clearing (null) sends null outfit_id", async () => {
    const s = fresh();
    s.chatId = "c1";
    s.actorId = "a1";
    fetchHandler = () => Response.json({ outfit_id: null, },);
    await s.select(null,);
    const put = fetchCalls.find((c,) => c.opts.method === "PUT",);
    expect(JSON.parse(put!.opts.body as string,).outfit_id,).toBeNull();
    expect(s.overrideId,).toBeNull();
  });

  test("server error keeps previous override and surfaces message", async () => {
    const s = fresh();
    s.chatId = "c1";
    s.actorId = "a1";
    s.overrideId = "o1";
    fetchHandler = () => Response.json({ message: "scene locked", }, { status: 403, },);
    await s.select("o2",);
    expect(s.overrideId,).toBe("o1",);
    expect(s.error,).toContain("scene locked",);
    expect(s.saving,).toBe(false,);
  });

  test("no-op without chat or actor", async () => {
    const s = fresh();
    await s.select("o1",);
    expect(fetchCalls,).toHaveLength(0,);
  });
});

describeOrSkip("outfitSwitcher.currentLabel", () => {
  test("resolves outfit name, falls back to scene default", () => {
    const s = fresh();
    expect(s.currentLabel,).toBe("wardrobe.sceneDefault",);
    s.outfits = [{ id: "o1", name: "Court Dress", }];
    s.overrideId = "o1";
    expect(s.currentLabel,).toBe("Court Dress",);
    s.overrideId = "ghost";
    expect(s.currentLabel,).toBe("wardrobe.sceneDefault",);
  });
});

describeOrSkip("outfitSwitcher.init/destroy", () => {
  test("subscribes to chat-context-refresh, reloads, then unsubscribes", async () => {
    const s = fresh();
    const listeners: { type: string; handler: EventListener }[] = [];
    const originalAdd = document.addEventListener.bind(document,);
    const originalRemove = document.removeEventListener.bind(document,);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).addEventListener = (type: string, handler: EventListener,) => {
      listeners.push({ type, handler, },);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).removeEventListener = (type: string, handler: EventListener,) => {
      const idx = listeners.findIndex((l,) => l.type === type && l.handler === handler,);
      if (idx >= 0) { listeners.splice(idx, 1,); }
    };
    try {
      mockChatScope(null, null,);
      s.init();
      expect(listeners.map((l,) => l.type,),).toContain("chat-context-refresh",);
      mockChatScope("c7", "a7",);
      fetchHandler = (url,) => url.includes("/wardrobe-override/")
        ? Response.json({ outfit_id: null, },)
        : Response.json([{ id: "ox", name: "Armor", },],);
      listeners[0]!.handler(new CustomEvent("chat-context-refresh",),);
      await new Promise<void>((resolve,) => setTimeout(resolve, 10,),);
      expect(s.chatId,).toBe("c7",);
      expect(s.outfits,).toHaveLength(1,);
      s.destroy();
      expect(listeners,).toHaveLength(0,);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).addEventListener = originalAdd;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).removeEventListener = originalRemove;
    }
  });
});

// ── Helpers ──
interface ChatScopeShape {
  activeChat: string | null;
  currentCharacter: { id: string } | null;
}

/** Install a fake chatState() root on document + an Alpine.$data double. */
function mockChatScope(chatId: string | null, actorId: string | null,): void {
  const root = { _chatStateRoot: true, };
  const scope: ChatScopeShape = {
    activeChat: chatId,
    currentCharacter: actorId ? { id: actorId, } : null,
  };
  const doc = globalThis.document as unknown as {
    querySelector: (sel: string,) => unknown;
  };
  doc.querySelector = (sel: string,) => sel === "[x-data='chatState()']" ? root : null;
  (globalThis as unknown as { Alpine?: unknown }).Alpine = {
    $data: () => scope,
  };
}
