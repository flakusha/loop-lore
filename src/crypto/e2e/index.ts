// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Encryption — Private Tier
 *
 * End-to-end encryption for private-tier chats.
 * Server stores encrypted key bundles; clients decrypt locally.
 */
export {
  decryptChatKeyFromBundle,
  encryptChatKeyForUser,
  listBundleUsers,
  loadKeyBundle,
  removeKeyBundles,
  storeKeyBundle,
} from "./key-bundle";
export type { KeyBundle, } from "./key-bundle";
