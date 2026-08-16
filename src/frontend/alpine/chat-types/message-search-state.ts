// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Message search (message-search.ts) ──────────────────
export interface ChatMessageSearchState {
  _msgSearchOpen: boolean;
  _msgSearchQuery: string;
  _msgSearchMatches: string[];
  _msgSearchTotal: number;
  _msgSearchIndex: number;
  _msgSearchLoading: boolean;
  _msgSearchDebounce: ReturnType<typeof setTimeout> | null;
  toggleMessageSearch(): void;
  onMessageSearchInput(): void;
  runMessageSearch(): Promise<void>;
  applyMessageSearchHighlights(): void;
  applySearchMatchActive(): void;
  scrollToSearchMatch(index: number,): void;
  nextMessageMatch(): void;
  prevMessageMatch(): void;
  onMessageSearchEnter(event: KeyboardEvent,): void;
  closeMessageSearch(): void;
}
