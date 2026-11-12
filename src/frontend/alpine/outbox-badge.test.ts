// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outbox badge unit tests (theme-4 AC4 observability): enqueue → count,
 * drain → count, discard behind confirm, the `ll-outbox:changed` refresh
 * bridge, and the pending-list view shape. Plus the i18n contract — every
 * new `chats.outbox*` key resolves in ALL 10 locale files.
 */
import { afterAll, afterEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { createOutbox, type OutboxSend, type OutboxStorage, } from "../pwa/outbox-store";
import { OUTBOX_CHANGED_EVENT, } from "../stores/connection";
import { createOutboxBadge, outboxSnippet, } from "./outbox-badge";

// ── Store fake (mirrors outbox-store.test.ts) ────────────────

function fakeStorage(): OutboxStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key,) => map.get(key,) ?? null,
    setItem: (key, value,) => {
      map.set(key, value,);
    },
    removeItem: (key,) => {
      map.delete(key,);
    },
  };
}

function seededStore(now: number,): ReturnType<typeof createOutbox> {
  const store = createOutbox({ storage: fakeStorage(), now: () => now, },);
  store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: JSON.stringify({ content: "first hello", },), },);
  store.enqueue({ chatId: "chat-b", idempotencyKey: "key-2", body: JSON.stringify({ content: "second message", },), },);
  return store;
}

const okSend: OutboxSend = async () => ({ ok: true, status: 201, });

// ── Document shim recording OUTBOX_CHANGED_EVENT listeners ───

const realDocument = globalThis.document;
let changeListeners: Array<() => void> = [];

function recordingDocument(): void {
  globalThis.document = {
    addEventListener: (type: string, fn: unknown,) => {
      if (type === OUTBOX_CHANGED_EVENT) { changeListeners.push(fn as () => void,); }
    },
    removeEventListener: () => {},
    dispatchEvent: () => true,
    querySelector: () => null,
  } as unknown as Document;
}

function dispatchChanged(): void {
  for (const fn of changeListeners) { fn(); }
}

afterEach(() => {
  globalThis.document = realDocument;
  changeListeners = [];
},);

// ── State transitions ─────────────────────────────────────────

describe("outbox badge state", () => {
  test("enqueue raises the count and the pending list mirrors the store", () => {
    const store = seededStore(1_700_000_000_000,);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => true, },);

    badge.refresh();

    expect(badge.depth,).toBe(2,);
    expect(badge.entries,).toHaveLength(2,);
    expect(badge.entries[0]?.snippet,).toBe("first hello",);
    expect(badge.entries[0]?.id,).toBe(store.entries()[0]?.id,);
    expect(badge.entries[0]?.queuedAt,).toContain("1",);
    expect(badge.open,).toBe(false,);
  });

  test("drain drops the count and closes the list when the queue empties", async () => {
    const store = seededStore(1,);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => true, },);
    badge.refresh();
    badge.toggle();
    expect(badge.open,).toBe(true,);

    await store.drain(okSend,);
    badge.refresh();

    expect(store.depth(),).toBe(0,);
    expect(badge.depth,).toBe(0,);
    expect(badge.entries,).toEqual([],);
    expect(badge.open,).toBe(false,);
  });

  test("discard with confirm removes only the targeted entry", () => {
    const store = seededStore(1,);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => true, },);
    badge.refresh();
    const target = store.entries()[0]?.id ?? "";

    badge.discard(target,);

    expect(store.depth(),).toBe(1,);
    expect(badge.depth,).toBe(1,);
    expect(store.entries()[0]?.idempotencyKey,).toBe("key-2",);
  });

  test("cancelled confirm keeps the queue untouched", () => {
    const store = seededStore(1,);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => false, },);
    badge.refresh();
    const target = store.entries()[0]?.id ?? "";

    badge.discard(target,);

    expect(store.depth(),).toBe(2,);
    expect(badge.depth,).toBe(2,);
  });

  test("toggle is a no-op on an empty queue", () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => true, },);
    badge.refresh();

    badge.toggle();

    expect(badge.open,).toBe(false,);
  });
});

// ── ll-outbox:changed bridge ──────────────────────────────────

describe("outbox badge change-event bridge", () => {
  test("init seeds depth and re-reads the store on ll-outbox:changed", () => {
    recordingDocument();
    const store = createOutbox({ storage: fakeStorage(), },);
    const badge = createOutboxBadge({ outbox: store, confirmFn: () => true, },);

    badge.init();
    expect(badge.depth,).toBe(0,);

    store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: '{"content":"queued"}', },);
    dispatchChanged();

    expect(changeListeners,).toHaveLength(1,);
    expect(badge.depth,).toBe(1,);
    expect(badge.entries[0]?.snippet,).toBe("queued",);
  });
});

// ── Snippet extraction ────────────────────────────────────────

describe("outboxSnippet", () => {
  test("collapses whitespace and ellipsizes long content", () => {
    expect(outboxSnippet(JSON.stringify({ content: "  hello \n world  ", },),),).toBe("hello world",);
    const long = "x".repeat(200,);
    const cut = outboxSnippet(JSON.stringify({ content: long, },),);
    expect(cut,).toHaveLength(80,);
    expect(cut.endsWith("…",),).toBe(true,);
  });

  test("non-content bodies yield an empty snippet", () => {
    expect(outboxSnippet("not json",),).toBe("",);
    expect(outboxSnippet(JSON.stringify({ other: 1, },),),).toBe("",);
  });
});

// ── i18n: chats.outbox* keys in ALL 10 locales ────────────────

const OUTBOX_KEYS = [
  "outboxBadgeTitle",
  "outboxEmpty",
  "outboxQueuedAt",
  "outboxDiscard",
  "outboxDiscardConfirm",
] as const;

const LOCALES = ["en", "de", "es", "fr", "ja", "ko", "pt", "ru", "zh", "ar",] as const;

describe("outbox badge i18n", () => {
  const localesDir = join(import.meta.dir, "../../public/locales",);

  test("every chats.outbox* key resolves in all 10 locale files", () => {
    for (const locale of LOCALES) {
      const catalog = JSON.parse(readFileSync(join(localesDir, `${locale}.json`,), "utf-8",),) as {
        chats?: Record<string, unknown>;
      };

      for (const key of OUTBOX_KEYS) {
        const value = catalog.chats?.[key];
        expect(typeof value,).toBe("string",);
        expect(String(value,).length,).toBeGreaterThan(0,);
      }
    }
  });

  test("outboxBadgeTitle carries the {count} placeholder for interpolation", () => {
    for (const locale of LOCALES) {
      const catalog = JSON.parse(readFileSync(join(localesDir, `${locale}.json`,), "utf-8",),) as {
        chats?: Record<string, string>;
      };

      expect(catalog.chats?.outboxBadgeTitle?.includes("{count}",),).toBe(true,);
    }
  });
});
