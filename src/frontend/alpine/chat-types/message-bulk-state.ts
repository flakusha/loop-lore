// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Pure selection snapshot used by the reducer. */
export interface MessageBulkSelection {
  selectedMessageIds: string[];
  anchorId: string | null;
}

/** Export formats offered by the bulk action bar. */
export type MessageBulkExportFormat = "md" | "json";

/** Message multi-select slice of chat state. */
export interface MessageBulkState {
  /** Ids picked in the timeline; UI-only, never persisted server-side. */
  selectedMessageIds: string[];
  /** Last toggled id — anchor for shift-click range select. */
  _messageSelectionAnchorId: string | null;
  /** Guards against double-submitting a bulk action. */
  _bulkActionBusy: boolean;
  /** Section target chosen in the bulk action bar. */
  _bulkTargetSectionId: string;

  toggleMessageSelection(messageId: string, shiftKey?: boolean,): void;
  selectAllVisibleMessages(): void;
  clearMessageSelection(): void;
  bulkDeleteSelectedMessages(hard?: boolean,): Promise<void>;
  bulkMoveSelectedMessages(sectionId: string | null,): Promise<void>;
  exportSelectedMessages(format: MessageBulkExportFormat,): Promise<void>;
}
