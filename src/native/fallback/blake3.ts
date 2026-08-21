// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BLAKE3 fallback — pure-TS implementation (@noble/hashes).
 *
 * Used when the native binary is unavailable (no Rust toolchain at build
 * time, unsupported platform, dlopen/ABI failure). Output is byte-identical
 * to the native path — parity is enforced by `blake3.test.ts`.
 *
 * Note the `.js` suffix: @noble/hashes' exports map exposes `./blake3.js`
 * (no extensionless alias) — the suffix is required for resolution.
 */

// lean-ctx: Bun.hash("blake3") returns bigint — not Uint8Array.
//          @noble/hashes blake3 returns Uint8Array compatible with existing code.
//          Upgrade when Bun.hash returns Uint8Array for all algorithms.

import { blake3 as nobleBlake3, } from "@noble/hashes/blake3.js";

/**
BLAKE3 digest length in bytes (256-bit output).
*/
export const BLAKE3_DIGEST_LENGTH = 32;

/**
 * BLAKE3 hash of `data` — pure-TS reference implementation.
 *
 * @param data - Input bytes.
 * @returns 32-byte BLAKE3 digest.
 */
export function blake3Hash(data: Uint8Array,): Uint8Array {
  return nobleBlake3(data,);
}
