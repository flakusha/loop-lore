// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";

/** */
export type ChatUtilsAnonymous = Partial<ChatState> & ThisType<ChatState>;

/** Cache for anonymous mode status — mutable module singleton */
// eslint-disable-next-line import/no-mutable-exports
export let _anonymousModeEnabled = false;

/**
 * Check if anonymous mode is enabled on the server.
 * Caches the result after first check.
 */
export async function initAnonymousModeCheck(): Promise<void> {
  try {
    const res = await apiFetch("/api/encryption/status", { headers: { Accept: "application/json", }, },);
    if (res.ok) {
      const data = await res.json();
      _anonymousModeEnabled = data.anonymousMode ?? false;
    } else {
      _anonymousModeEnabled = false;
    }
  } catch {
    _anonymousModeEnabled = false;
  }
}

/**
 * Get cached anonymous mode status.
 */
export function isAnonymousMode(): boolean {
  return _anonymousModeEnabled;
}
