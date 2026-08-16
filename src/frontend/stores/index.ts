// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alpine Store Registry — single source of truth for all Alpine stores.
 *
 * Import `initAlpineStores()` in alpine-init.ts (single bundle entry).
 * Uses globalThis lock to ensure stores are registered exactly once.
 *
 * To add a new store:
 *   1. Create stores/{name}-store.ts exporting the definition object
 *   2. Import it here and add to the `stores` map below
 */

import { uiStoreDefinition, } from "./ui-store";

/** Store name → initial value object. */
const stores: Record<string, Record<string, unknown>> = {
  sidebar: { open: false, },
  chat: { currentChat: null, },
  ui: uiStoreDefinition as Record<string, unknown>,
};

// Global lock — defensive, in case initAlpineStores is called more than once.
const LOCK_KEY = "__alpineStoresInitialized";

/**
 * Register all Alpine stores. Atomic — uses globalThis lock to ensure
 * registration happens exactly once, regardless of how many bundles call this.
 *
 * Wrapped in try-catch so a store registration failure never prevents
 * Alpine.start() from being scheduled (vendor.ts calls this inline before
 * the DOMContentLoaded listener).
 */
export function initAlpineStores(): void {
  if (!globalThis.Alpine) { return; }
  if ((globalThis as any)[LOCK_KEY]) { return; }
  (globalThis as any)[LOCK_KEY] = true;

  for (const [name, value,] of Object.entries(stores,)) {
    try {
      Alpine.store(name, value,);
    } catch (error) {
      console.warn(`[stores] Failed to register "${name}":`, error,);
    }
  }
}
