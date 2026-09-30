// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Composer prompt-improvement state and methods (epic-prompt-improvement). */
export interface ChatPromptImproveState {
  /** True while an improve/analyze call is in flight. */
  _improving: boolean;
  /** Drafts saved before each improve — undo pops one level (max 5). */
  _promptImproveHistory: string[];
  pushPromptImproveHistory(draft: string,): void;
  improvePrompt(level?: string,): Promise<void>;
  restorePromptDraft(): void;
}
