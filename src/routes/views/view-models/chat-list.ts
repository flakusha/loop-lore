// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * View-model for `/dynamic/chats/list` and `/dynamic/chats/search` — the seam
 * a non-htmx client (the experimental egui frontend) consumes instead of
 * parsing the chat-list cards.
 *
 * `buildChatListViewModel()` is pure: enriched rows in, plain JSON-able data
 * out. Raw, unescaped text; escaping is the renderer's job, so the HTML and
 * the JSON branch cannot drift. Derived UI values the htmx card renders
 * (`hasMore`, the load-more count) come along so a JSON client does not have
 * to re-derive pagination.
 */

/** The enriched chat row both chat handlers already build. */
export interface ChatListRow {
  id: string;
  name: string;
  type: string;
  is_pinned: string;
  updated_at: string;
  created_at: string;
  world_name: string | null;
  location_name: string | null;
  encryption_level: string;
  participant_count: number;
  last_message: string | null;
}

/** One chat row. */
export interface ChatListItem {
  id: string;
  name: string;
  /** Raw chat type as stored; the htmx card renders an emoji per value. */
  type: string;
  isPinned: boolean;
  updatedAt: string;
  createdAt: string;
  worldName: string | null;
  locationName: string | null;
  encryptionLevel: string;
  participantCount: number;
  /** Latest non-deleted message preview, or null when the chat is empty. */
  lastMessage: string | null;
}

/** The whole list. `hasMore` mirrors the htmx load-more button's condition. */
export interface ChatListViewModel {
  chats: ChatListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * Project enriched chat rows into the chat-list view-model.
 * @param rows - enriched rows in display order (see `enrichChats`)
 * @param page - the 1-based page the rows came from
 * @param pageSize - the page size the query used
 * @param total - the unfiltered row count for the same filter set
 * @returns the view-model the HTML renderer and the JSON branch share
 */
export function buildChatListViewModel(
  { rows, page, pageSize, total, }: {
    rows: readonly ChatListRow[];
    page: number;
    pageSize: number;
    total: number;
  },
): ChatListViewModel {
  const offset = (page - 1) * pageSize;
  return {
    chats: Array.from(rows, (row,) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      isPinned: row.is_pinned === "pinned",
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      worldName: row.world_name,
      locationName: row.location_name,
      encryptionLevel: row.encryption_level,
      participantCount: row.participant_count,
      lastMessage: row.last_message,
    }),),
    page,
    pageSize,
    total,
    hasMore: offset + pageSize < total,
  };
}
