// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** A gallery asset row as returned by `GET /api/v1/assets` (picker feed). */
export interface GalleryAsset {
  id: string;
  type?: string;
  mime_type?: string;
  filename?: string;
  width?: number;
  height?: number;
}

/**
 * Message action-row slice of chat state (merge into ChatState on
 * registration) — per-message improve + attach picker
 * (TASK-chat-feature-component-buttons).
 */
export interface MessageActionsState {
  /** Message id currently running an improve request (button disable guard). */
  _improvingMessageId: string | null;
  /** Message id whose attach picker is open; null when closed. */
  _assetPickerFor: string | null;
  /** Gallery rows loaded for the open picker, filtered by registered kinds. */
  _assetPickerAssets: GalleryAsset[];
  /** True while the picker's gallery fetch is in flight. */
  _assetPickerLoading: boolean;

  /**
   * Improve a user-authored message in place via the shared prompt-improve
   * service; splices the result back without reloading the thread.
   * @param messageId - Target message id
   */
  improveMessage(messageId: string,): Promise<void>;
  /**
   * Open the attach picker for one message and load the chat gallery.
   * @param messageId - Message the picker will attach to
   */
  openAssetPicker(messageId: string,): Promise<void>;
  /** Close the attach picker and drop its loaded rows. */
  closeAssetPicker(): void;
  /**
   * Attach a gallery asset to an already-sent message and refresh its row.
   * @param messageId - Message to attach to
   * @param assetId - Owned gallery asset id
   */
  attachAssetToMessage(messageId: string, assetId: string,): Promise<void>;
}
