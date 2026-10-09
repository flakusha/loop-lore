// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-list filter, search, and mention state (chat-filters.ts, chat-search, mentions). */
export interface ChatCoreFilterState {
  _chatFilter: string;
  readonly filteredChats: { id: string; name?: string }[];
  // Chat-list filters (chat-filters.ts) — server-side query params for /api/v1/chats.
  _chatType: "all" | "direct" | "group";
  _chatStatus: "all" | "active" | "archived";
  _chatSort: "recent" | "name" | "unread" | "pinned-first";
  _chatWorld: string;
  _chatMinMessages: string;
  _chatMaxMessages: string;
  _chatUpdatedSince: string;
  _filterParams(): string;
  restoreChatFilters(): void;
  persistChatFilters(): void;
  activeChatFilterChips(): {
    key: "type" | "status" | "sort" | "world" | "minMessages" | "maxMessages" | "updatedSince";
    label: string;
  }[];
  clearChatFilter(
    key: "type" | "status" | "sort" | "world" | "minMessages" | "maxMessages" | "updatedSince",
  ): Promise<void>;
  clearAllChatFilters(): Promise<void>;
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
  _mentionActiveIndex: number;
  _chatParticipants: {
    actor_id: string;
    name: string;
    display_name?: string;
    actor_type?: string;
  }[];
  handleMentionInput(event: Event,): void;
  selectMention(participant: { actor_id: string; name: string },): void;
  hideMentionAutocomplete(): void;
  acceptMentionAtIndex(index: number,): void;
  moveMentionSelection(delta: 1 | -1,): void;
  handleComposerKeydown(event: KeyboardEvent,): void;
  handleComposerEnter(): void;
  // Slash-command typed-token autocomplete (slash-autocomplete.ts).
  // Mirrors the @mention block above; reads `_commandList` populated by
  // command-palette.ts so the candidate set is always registry-driven.
  _slashQuery: string;
  _slashCandidates: {
    name: string;
    description: string;
    descriptionKey: string;
  }[];
  _showSlashPopover: boolean;
  _slashActiveIndex: number;
  handleSlashInput(event: Event,): void;
  selectSlashCandidate(candidate: {
    name: string;
    description: string;
    descriptionKey: string;
  },): void;
  hideSlashPopover(): void;
  acceptSlashAtIndex(index: number,): boolean;
  moveSlashSelection(delta: 1 | -1,): void;
  handleSlashKeydown(event: KeyboardEvent,): void;
  handleSlashEnter(): boolean;
  // `:` emoji autocomplete (slash-autocomplete.ts) — shares the `/` popup
  // pattern (Tab-accept parity); candidates come from the allowlisted
  // shortcode map in chat-utils/render.ts.
  _emojiQuery: string;
  _emojiCandidates: { name: string; emoji: string }[];
  _showEmojiPopover: boolean;
  _emojiActiveIndex: number;
  handleEmojiInput(event: Event,): void;
  selectEmojiCandidate(candidate: { name: string; emoji: string },): void;
  hideEmojiPopover(): void;
  acceptEmojiAtIndex(index: number,): boolean;
  moveEmojiSelection(delta: 1 | -1,): void;
  handleEmojiKeydown(event: KeyboardEvent,): void;
  handleEmojiEnter(): boolean;
  _emojiPickerOpen: boolean;
  _emojiPickerQuery: string;
  _emojiPickerResults: { name: string; emoji: string }[];
  _emojiPickerActiveIndex: number;
  toggleEmojiPicker(): void;
  closeEmojiPicker(): void;
  filterEmojiPicker(): void;
  insertEmoji(candidate: { name: string; emoji: string },): void;
  insertEmojiAtIndex(index: number,): void;
  moveEmojiPickerSelection(delta: 1 | -1,): void;
}
