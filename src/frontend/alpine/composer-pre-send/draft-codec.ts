// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonParse, } from "../json";
import { DRAFT_TTL_MS, } from "./constants";

/** Persisted shape for a single chat's draft. */
export interface StoredDraft {
  chatId: string;
  text: string;
  savedAt: number;
}

/**
 * Decode a stored draft entry. `now` defaults to wall-clock when omitted so
 * legacy callers can still call this without injecting a clock; the factory
 * always supplies the same `now` it uses for `persistDraft`, so the TTL
 * check is consistent under frozen-clock test harnesses.
 * @param raw
 * @param now
 */
export function decodeStoredDraft(
  raw: string | null,
  now: () => number = Date.now,
): StoredDraft | null {
  if (!raw) { return null; }
  try {
    const parsedResult = safeJsonParse<Partial<StoredDraft>>(raw,);
    if (!parsedResult.ok) { return null; }
    const parsed = parsedResult.value;
    if (
      typeof parsed.chatId !== "string" ||
      typeof parsed.text !== "string" ||
      typeof parsed.savedAt !== "number"
    ) { return null; }
    if (now() - parsed.savedAt > DRAFT_TTL_MS) { return null; }
    return { chatId: parsed.chatId, text: parsed.text, savedAt: parsed.savedAt, };
  } catch {
    return null;
  }
}
