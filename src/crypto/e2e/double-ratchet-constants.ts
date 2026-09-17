// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message ephemeral-ratchet constants shared between
 * `double-ratchet.ts` and `double-ratchet-chain.ts`.
 *
 * Extracted to break the circular dependency where each file needed the
 * other's runtime exports. (The constants are pure values, not types.)
 */

export const CHAIN_KEY_INFO = "loop-lore-e2e-ephemeral-chain-v1" as const;
export const KEY_LENGTH = 32;
export const NONCE_LENGTH = 12;
