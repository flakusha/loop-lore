// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — happinessToMood helper
 *
 * Maps a happiness value (0-100) to a mood label. Exported for reuse by
 * dispatchers; a pure, stable domain mapping.
 */
/**
 * Convert happiness value to mood string.
 * @param happiness - Happiness value (0-100)
 * @returns Mood string
 */
export function happinessToMood(happiness: number,): string {
  if (happiness >= 80) { return "ecstatic"; }
  if (happiness >= 60) { return "happy"; }
  if (happiness >= 45) { return "neutral"; }
  if (happiness >= 25) { return "sad"; }
  return "miserable";
}
