// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Init-image attachment slice of chat state (TASK-add-init-image-
 * attachment-affordance). The id refers to an owned asset; the server proves
 * ownership and reads the bytes, so the UI never sends a path or filename.
 */
export interface InitImageState {
  /** Currently attached asset (null when the img2img path is not armed). */
  _initImage: {
    assetId: string | null;
    filename: string;
    uploading: boolean;
    error: string;
  };
  /**
   * Upload a file through the existing asset endpoint and attach it once the
   * upload completes (never before — submit must not race the upload).
   * @param file - The picked image file
   */
  attachInitImage(file: File,): Promise<void>;
  /** Attach an already-owned asset (gallery selection). */
  selectInitImage(assetId: string, filename?: string,): void;
  /** Detach the init image, returning the path to plain generation. */
  clearInitImage(): void;
  /** Request fields for the selected init image, empty when none is set. */
  initImageBody(): Record<string, unknown>;
}
