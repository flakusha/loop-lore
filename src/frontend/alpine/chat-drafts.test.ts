import { describe, expect, test, } from "bun:test";
import {
  DRAFT_MAX_CHARS,
  DRAFT_MAX_CHATS,
  chatDraftMethods,
  clearDraft,
  readDraft,
  readDraftIndex,
  writeDraft,
  type DraftStore,
} from "./chat-drafts";

function memStore(): DraftStore {
  const data = new Map<string, string>();
  return {
    getItem: (key,) => data.get(key,) ?? null,
    setItem: (key, value,) => {
      data.set(key, value,);
    },
    removeItem: (key,) => {
      data.delete(key,);
    },
  };
}

function throwingStore(): DraftStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded",);
    },
    removeItem: () => {
      throw new Error("denied",);
    },
  };
}

interface DraftCtx {
  activeChat: string | null;
  $refs: { messageInput?: { value: string } };
  autoResize: (el: unknown,) => void;
  resized: unknown[];
  _draftTimer: ReturnType<typeof setTimeout> | null;
}

function buildCtx(overrides?: Partial<DraftCtx>,): DraftCtx {
  const ctx: DraftCtx = {
    activeChat: "chat-1",
    $refs: { messageInput: { value: "", }, },
    autoResize: (el,) => {
      ctx.resized.push(el,);
    },
    resized: [],
    _draftTimer: null,
    ...overrides,
  };
  return ctx;
}

function clearTimer(ctx: DraftCtx,) {
  if (ctx._draftTimer) {
    clearTimeout(ctx._draftTimer,);
    ctx._draftTimer = null;
  }
}

describe("draft storage helpers", () => {
  test("write/read round-trips text", () => {
    const store = memStore();
    writeDraft(store, "c1", "hello",);
    expect(readDraft(store, "c1",)?.text,).toBe("hello",);
  });

  test("blank text removes the draft instead of storing", () => {
    const store = memStore();
    writeDraft(store, "c1", "hello",);
    writeDraft(store, "c1", "",);
    expect(readDraft(store, "c1",),).toBeNull();
    expect(readDraftIndex(store,),).toEqual([],);
  });

  test("missing and malformed drafts read as null", () => {
    const store = memStore();
    expect(readDraft(store, "nope",),).toBeNull();
    store.setItem("loop-lore:composer-draft:bad", "not-json",);
    expect(readDraft(store, "bad",),).toBeNull();
    store.setItem("loop-lore:composer-draft:empty", JSON.stringify({ text: "", },),);
    expect(readDraft(store, "empty",),).toBeNull();
  });

  test("corrupt index reads as empty", () => {
    const store = memStore();
    store.setItem("loop-lore:composer-drafts:index", "[[[",);
    expect(readDraftIndex(store,),).toEqual([],);
  });

  test("text is truncated to the per-draft cap", () => {
    const store = memStore();
    writeDraft(store, "c1", "x".repeat(DRAFT_MAX_CHARS + 10,),);
    expect(readDraft(store, "c1",)?.text.length,).toBe(DRAFT_MAX_CHARS,);
  });

  test("index stays MRU-first and evicts past the chat cap", () => {
    const store = memStore();
    for (let i = 0; i < DRAFT_MAX_CHATS + 1; i += 1) {
      writeDraft(store, `c${i}`, `text-${i}`,);
    }
    expect(readDraftIndex(store,),).toHaveLength(DRAFT_MAX_CHATS,);
    expect(readDraftIndex(store,)[0],).toBe(`c${DRAFT_MAX_CHATS}`,);
    expect(readDraft(store, "c0",),).toBeNull();
    expect(readDraft(store, "c1",)?.text,).toBe("text-1",);
  });

  test("re-saving a chat moves it to the front without duplicating", () => {
    const store = memStore();
    writeDraft(store, "a", "1",);
    writeDraft(store, "b", "2",);
    writeDraft(store, "a", "3",);
    expect(readDraftIndex(store,),).toEqual(["a", "b",],);
  });

  test("quota and removal failures never throw", () => {
    const store = throwingStore();
    expect(() => writeDraft(store, "c1", "hi",),).not.toThrow();
    expect(() => clearDraft(store, "c1",),).not.toThrow();
  });
});

describe("chatDraftMethods", () => {
  test("save schedules a debounced write without writing synchronously", () => {
    const store = memStore();
    const ctx = buildCtx();
    ctx.$refs.messageInput!.value = "typed";
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    expect(ctx._draftTimer,).not.toBeNull();
    expect(readDraft(store, "chat-1",),).toBeNull();
    clearTimer(ctx,);
  });

  test("a second save cancels the pending timer", () => {
    const store = memStore();
    const ctx = buildCtx();
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    const first = ctx._draftTimer;
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    expect(ctx._draftTimer,).not.toBe(first,);
    clearTimer(ctx,);
  });

  test("save is a no-op without an active chat", () => {
    const store = memStore();
    const ctx = buildCtx({ activeChat: null, },);
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    expect(ctx._draftTimer,).toBeNull();
  });

  test("flush writes the current input immediately and clears the timer", () => {
    const store = memStore();
    const ctx = buildCtx();
    ctx.$refs.messageInput!.value = "now";
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    chatDraftMethods.flushComposerDraft!.call(ctx as never, store,);
    expect(ctx._draftTimer,).toBeNull();
    expect(readDraft(store, "chat-1",)?.text,).toBe("now",);
  });

  test("restore fills the input and resizes", () => {
    const store = memStore();
    writeDraft(store, "chat-1", "back again",);
    const ctx = buildCtx();
    chatDraftMethods.restoreComposerDraft!.call(ctx as never, store,);
    expect(ctx.$refs.messageInput!.value,).toBe("back again",);
    expect(ctx.resized,).toHaveLength(1,);
  });

  test("restore clears the input when the chat has no draft", () => {
    const store = memStore();
    const ctx = buildCtx();
    ctx.$refs.messageInput!.value = "stale";
    chatDraftMethods.restoreComposerDraft!.call(ctx as never, store,);
    expect(ctx.$refs.messageInput!.value,).toBe("",);
  });

  test("restore ignores a missing textarea", () => {
    const store = memStore();
    writeDraft(store, "chat-1", "kept",);
    const ctx = buildCtx({ $refs: {}, },);
    expect(() => chatDraftMethods.restoreComposerDraft!.call(ctx as never, store,),).not.toThrow();
    expect(readDraft(store, "chat-1",)?.text,).toBe("kept",);
  });

  test("clear drops the draft and cancels a pending save", () => {
    const store = memStore();
    writeDraft(store, "chat-1", "doomed",);
    const ctx = buildCtx();
    chatDraftMethods.saveComposerDraft!.call(ctx as never, store,);
    chatDraftMethods.clearComposerDraft!.call(ctx as never, store,);
    expect(ctx._draftTimer,).toBeNull();
    expect(readDraft(store, "chat-1",),).toBeNull();
  });
});
