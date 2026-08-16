// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Estimate tokens from content length (~4 chars per token). */
export function estimateTokens(content: string,): number {
  return Math.ceil(content.length / 4,);
}
