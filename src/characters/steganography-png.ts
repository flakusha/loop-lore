// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 20

const MINIMAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000" +
    "907753de0000000c4944415478016360f8cf000000020001e221bc3300" +
    "00000049454e44ae426082",
  "hex",
);

/**
 * Get a minimal PNG buffer suitable for character card export.
 */
export function getMinimalPng(): Buffer {
  return Buffer.from(MINIMAL_PNG,);
}
