// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { setDiceRolling, } from "./skill-check-display.js";

export * from "./skill-check-display.js";

export interface SkillCheckAnimationOptions {
  frames?: number;
  intervalMs?: number;
  onComplete?: (finalRoll: number,) => void;
}

export function animateDiceRoll(
  dice: HTMLElement,
  finalRoll: number,
  options: SkillCheckAnimationOptions = {},
): void {
  const frames = options.frames ?? 8;
  const intervalMs = options.intervalMs ?? 40;
  setDiceRolling(dice, true,);

  let i = 0;
  const tick = (): void => {
    i += 1;
    if (i >= frames) {
      dice.textContent = String(finalRoll,);
      setDiceRolling(dice, false,);
      options.onComplete?.(finalRoll,);

      return;
    }

    dice.textContent = String(Math.floor(Math.random() * 20,) + 1,);
    setTimeout(tick, intervalMs,);
  };

  setTimeout(tick, intervalMs,);
}

export const animateSkillCheck = animateDiceRoll;
