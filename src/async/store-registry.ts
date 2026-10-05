// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/async/store-registry.ts — Module-level handle to the live async store.
//
// `createApp` returns the Elysia app, not the store it builds, so a shutdown
// path cannot reach the drain through the return value. Rather than thread the
// store through all 39 `createApp` callers, it registers itself here — the same
// shape the cron scheduler uses (`src/cron/registry.ts`).
//
// Without this, every teardown destroyed the DB handle while the store's
// fire-and-forget queue still held writes, and the drain logged and swallowed
// `RangeError: Cannot use a closed database`.
// BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s

import type { AsyncStore, } from "./store";

let activeStore: AsyncStore | null = null;

/**
 * Register the live store so `flushActiveStore()` can reach it.
 * @param store
 */
export function setStore(store: AsyncStore | null,): void {
  activeStore = store;
}

/**
 * Flush the live store's queue, if one is registered. Awaits quiescence, so a
 * caller may destroy the DB handle on the very next statement. No-op when no
 * store was ever constructed (unit tests that never boot the app).
 * @throws Never — a drain that already failed logs and swallows, so this
 * resolves even when the underlying writes error.
 */
export async function flushActiveStore(): Promise<void> {
  await activeStore?.flush();
}
