// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game State Patterns
 *
 * Compiled regex patterns and extractors for fenced ```game-state JSON
 * blocks emitted by LLM narration. The fence opener must be exactly
 * ```game-state at line start, so other-language fences mentioning
 * game-state never match.
 * @module regex/game-state
 */

// ── Game State Block Patterns ─────────────────────────────

/** Fenced ```game-state block; capture group 1 is the inner payload. */
export const GAME_STATE_BLOCK = /^```game-state\n([\s\S]*?)```/m;

/** All fenced ```game-state blocks (global iterator). */
export const GAME_STATE_BLOCK_ALL = /^```game-state\n([\s\S]*?)```/mg;

/**
 * Extract the first fenced game-state block payload, trimmed.
 * @param content - narration content to scan
 * @returns the first payload, or null when no block is present
 */
export function extractGameStateBlock(content: string,): string | null {
  const match = GAME_STATE_BLOCK.exec(content,);
  if (!match) { return null; }
  return (match[1] ?? "").trim();
}

/**
 * Extract every fenced game-state block payload, in order, trimmed.
 * @param content - narration content to scan
 * @returns all payloads in order, or [] when no block is present
 */
export function extractGameStateBlocks(content: string,): string[] {
  const payloads: string[] = [];
  for (const match of content.matchAll(GAME_STATE_BLOCK_ALL,)) {
    payloads.push((match[1] ?? "").trim(),);
  }

  return payloads;
}
