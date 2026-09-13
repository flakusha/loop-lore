// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Composer prompt-improvement state and methods (epic-prompt-improvement). */
export interface ChatPromptImproveState {
  /** True while an improve/analyze call is in flight. */
  _improving: boolean;
  /** Draft saved before the last improve — one-click undo. */
  _promptImproveBackup: string | undefined;
  improvePrompt(level?: string,): Promise<void>;
  restorePromptDraft(): void;
}
