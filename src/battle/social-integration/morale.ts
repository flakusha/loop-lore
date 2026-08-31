// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MoraleState, } from "../integration-schemas";

/**
 * Process morale break
 * @param targetMorale
 */
export function processMoraleBreak(
  targetMorale: MoraleState,
): { broke: boolean; effects: string[] } {
  const effects: string[] = [];

  if (targetMorale.level === "broken") {
    effects.push("Target is panicking!", "Target may flee or surrender!", "Target suffers -20 to all rolls!",);
    return { broke: true, effects, };
  }

  if (targetMorale.level === "shaken") {
    effects.push("Target is shaken!", "Target suffers -10 to attack rolls!",);
    return { broke: false, effects, };
  }

  return { broke: false, effects, };
}
