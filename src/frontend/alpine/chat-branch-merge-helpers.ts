// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Envelope the merge routes wrap payloads in: `{ data: … }`. */
export interface MergeEnvelope<T,> {
  data?: T;
}

/** Error response from the merge routes. */
export interface MergeErrorBody {
  error?: { message?: string; code?: string };
}

/**
 * `$store.ui` when Alpine is initialized; null during tests/SSR.
 * @returns the ui store or null
 */
export function uiStore(): Record<string, unknown> | null {
  if (typeof Alpine === "undefined") { return null; }
  try {
    return Alpine.store("ui",) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract an error message from a failed merge response.
 * @param res
 * @returns {string}
 */
export async function mergeErrorMessage(res: Response,): Promise<string> {
  try {
    const body = await res.json() as MergeErrorBody;
    return body.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
