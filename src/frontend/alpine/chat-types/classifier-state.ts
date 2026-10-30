// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Classifier tag subset picker (chat-settings/classifier-tags.ts). */
export interface ChatCoreClassifierState {
  _classifierVocabulary: string[];
  _classifierActive: string[];
  _classifierDirty: boolean;
  loadClassifierTags(): Promise<void>;
  toggleClassifierTag(tag: string,): void;
  saveClassifierTags(): Promise<void>;
}
