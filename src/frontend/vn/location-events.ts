// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN location ledger — last-seen location id per chat, stored raw in
 * localStorage so the `on_location_change` trigger can diff on next render.
 */

const KEY_PREFIX = "vn:last-location:";

/** Persist (or clear with null) the last-seen location for a chat. */
export function saveLastLocation(chatId: string, locationId: string | null,): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) { return; }
    if (locationId === null) { storage.removeItem(KEY_PREFIX + chatId,); }
    else { storage.setItem(KEY_PREFIX + chatId, locationId,); }
  } catch {
    return;
  }
}

/** Read the stored last-seen location; `{}` when absent. Never throws. */
export function getLocationContext(chatId: string,): { currentLocationId?: string; previousLocationId?: string } {
  try {
    const storage = globalThis.localStorage;
    if (!storage) { return {}; }
    const stored = storage.getItem(KEY_PREFIX + chatId,);
    return stored === null ? {} : { currentLocationId: stored, };
  } catch {
    return {};
  }
}
