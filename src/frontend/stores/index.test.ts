// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stores registry — default values for the chat store.
 *
 * Regression: BUG-alpine-init-crash-chat-view-store-undefined.
 * Before the fix the chat store had only `currentChat: null`. Templates that
 * read `$store.chat.children` / `$store.chat.visibility` during Alpine
 * init() crashed with "Cannot read properties of undefined/null", aborting
 * the chat-view mount and leaving #chat-list unrendered.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { initAlpineStores, } from "./index";

type StoreMap = Record<string, Record<string, unknown>>;

function makeAlpineStub() {
  const stores: StoreMap = {};
  return {
    alpine: {
      store(name: string, value: Record<string, unknown>,) {
        stores[name] = value;
      },
    },
    stores,
  };
}

describe("initAlpineStores — chat store defaults", () => {
  let originalAlpine: unknown;
  let lockKey: string | undefined;

  beforeEach(() => {
    originalAlpine = (globalThis as { Alpine?: unknown }).Alpine;
    lockKey = "__alpineStoresInitialized";
    delete (globalThis as Record<string, unknown>)[lockKey];
  },);

  afterEach(() => {
    (globalThis as { Alpine?: unknown }).Alpine = originalAlpine;
    if (lockKey) { delete (globalThis as Record<string, unknown>)[lockKey]; }
  },);

  test("registers chat store with safe children + visibility defaults", () => {
    const { alpine, stores, } = makeAlpineStub();
    (globalThis as { Alpine?: unknown }).Alpine = alpine;
    initAlpineStores();

    const chat = stores.chat;
    expect(chat, "chat store must be registered",).toBeDefined();
    expect(Array.isArray(chat.children,), "chat.children must be an array",).toBe(true,);
    expect(chat.children,).toEqual([],);
    expect(chat.visibility,).toBe("visible",);
    expect("currentChat" in chat,).toBe(true,);
  },);

  test("chat store children + visibility are never null/undefined out of the box", () => {
    const { alpine, stores, } = makeAlpineStub();
    (globalThis as { Alpine?: unknown }).Alpine = alpine;
    initAlpineStores();

    const chat = stores.chat;
    // Reading `chat.children` or `chat.visibility` must never throw — this is
    // the regression scenario the original ticket flagged.
    expect(() => { void chat.children?.length; },).not.toThrow();
    expect(() => { void (chat.visibility as string | undefined)?.length; },).not.toThrow();
  },);
});
