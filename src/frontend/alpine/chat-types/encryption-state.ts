// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Per-chat end-to-end encryption key state. */
export interface ChatCoreEncryptionState {
  _chatKey: CryptoKey | null;
  _encryptionEnabled: boolean;
  _keyId: string | null;
  /** Tier of the active chat (from the list row); gates the key fetch. */
  _activeChatEncryptionLevel: string | null;
}
