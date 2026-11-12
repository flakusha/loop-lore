// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Connection store — online/offline state for the layout banner and the
 * chat-send offline gate (TASK-pwa-cached-shell-plus-send-queue slice 2).
 *
 * Definition only, mirroring `ui-store.ts`: `watchConnection()` in
 * `./connection.ts` binds the `online` / `offline` listeners and flips
 * `Alpine.store("connection").offline`; templates read
 * `$store.connection.offline` in the persistent layout shell.
 */

/** Initial store shape — `watchConnection` seeds it from `navigator.onLine`. */
export const connectionStoreDefinition: Record<string, unknown> = {
  /** True when the browser reports no network (offline banner + send gate). */
  offline: false,
};
