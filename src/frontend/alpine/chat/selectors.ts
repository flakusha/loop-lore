// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat list selectors (split from bootstrap.ts for the size gate). */

/** Chat-list entry shape the selectors operate on. */
export interface ChatListEntry {
  id: string;
  name?: string;
  thinking_visibility?: string;
}

/**
 * Filter the chat list by a case-insensitive name substring.
 * @param chats - full chat list
 * @param filter - raw filter text (empty returns the list as-is)
 * @returns the filtered chat list
 */
export function filterChatList<T extends ChatListEntry,>(chats: T[], filter: string,): T[] {
  const needle = (filter || "").toLowerCase();
  if (!needle) { return chats; }
  const out: T[] = [];
  for (const c of chats) { if ((c.name || "").toLowerCase().includes(needle,)) { out.push(c,); } }
  return out;
}

/**
 * Find the active chat by id.
 * @param chats - full chat list
 * @param activeChat - active chat id (or null)
 * @returns the active chat, or null when unset/missing
 */
export function findActiveChat<T extends ChatListEntry,>(chats: T[], activeChat: string | null,): T | null {
  return chats.find((c,) => c.id === activeChat) ?? null;
}
