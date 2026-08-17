// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-page UI overlay, dialog, and reaction state. */
export interface ChatCoreUiState {
  _hamburgerOpen: Record<string, boolean>;
  _statsOpen: Record<string, boolean>;
  _contextMenu: { visible: boolean; messageId: string | null; x: number; y: number };
  _flagDialog: {
    open: boolean;
    contentType: "message" | "asset";
    contentId: string | null;
    chatId: string | null;
  };
  _flagReason: string;
  _flagOther: string;
  _flagBusy: boolean;
  openFlagDialog(contentType: "message" | "asset", contentId: string, chatId: string | null,): void;
  closeFlagDialog(): void;
  submitFlag(): Promise<void>;
  _impersonationLoaded: boolean;
  _storageHandler: ((e: StorageEvent,) => void) | null;
  _unseenCounts: Record<string, number>;
  _isScrolledUp: boolean;
  _scrollHandler: (() => void) | null;
  _debugView: boolean;
  _showCommandPalette: boolean;
  _activeCommand: string;
  _commandList: { name: string; description: string }[];
  _filteredCommands: { name: string; description: string }[];
  openContextMenu(event: MouseEvent, msgId: string,): void;
  closeContextMenu(): void;
  toggleReaction(msgId: string, emoji: string,): Promise<void>;
  loadMessageReactions(msgId: string,): Promise<void>;
  loadAllReactions(): Promise<void>;
  _reactionPicker: { visible: boolean; messageId: string; x: number; y: number };
  _quickEmojis: string[];
  showReactionPicker(msgId: string, event: Event,): void;
  closeReactionPicker(): void;
  // Creation wizard state — preview panel for LLM-generated entity drafts
  wizardDraft: {
    wizardId: string;
    entityType: string;
    label: string;
    fields: Record<string, string | undefined>;
    worldId?: string;
    userId?: string;
    description?: string;
    warnings?: string[];
  } | null;
  wizardPreviewOpen: boolean;
  confirmWizard(wizardId: string,): Promise<void>;
  cancelWizard(wizardId: string,): Promise<void>;
  updateWizardField(field: string, value: string,): void;
}
