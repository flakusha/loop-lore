// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-list filter, search, and mention state (chat-filters.ts, chat-search, mentions). */
export interface ChatCoreFilterState {
  _chatFilter: string;
  readonly filteredChats: { id: string; name?: string }[];
  // Chat-list filters (chat-filters.ts) — server-side query params for /api/chats.
  _chatType: "all" | "direct" | "group";
  _chatStatus: "all" | "active" | "archived";
  _chatSort: "recent" | "name" | "unread" | "pinned-first";
  _chatWorld: string;
  _chatMinMessages: string;
  _chatMaxMessages: string;
  _chatUpdatedSince: string;
  _filterParams(): string;
  applyChatFilters(): Promise<void>;
  _searchResults: {
    chatId: string;
    chatName: string;
    characterName: string;
    characterAvatar: string | null;
  }[];
  searchChats(q: string,): Promise<void>;
  selectedChats: string[];
  _mentionQuery: string;
  _mentionResults: {
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }[];
  _showMentionAutocomplete: boolean;
  _chatParticipants: {
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }[];
  handleMentionInput(event: Event,): void;
  selectMention(participant: { actor_id: string; name: string },): void;
  hideMentionAutocomplete(): void;
}
