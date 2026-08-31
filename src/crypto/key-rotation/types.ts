// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key rotation result/summary types.
 */

/** */
export interface RotationResult {
  actorId: string;
  oldKeyId: string;
  newKeyId: string;
  chatsAffected: number;
  messagesReEncrypted: number;
}

/** */
export interface RotationSummary {
  checked: number;
  rotated: number;
  results: RotationResult[];
  errors: string[];
}
