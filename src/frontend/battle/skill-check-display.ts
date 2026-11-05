// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../alpine/i18n";

export interface SkillCheckResult {
  roll: number;
  modifier: number;
  total: number;
  dc: number;
  critical?: "hit" | "fail" | null;
}

/** A rendered skill-check chip and the dice face inside it. */
export interface SkillCheckChip {
  /** The chip root element. */
  root: HTMLElement;
  /** The dice face element (tumbles while the roll animates). */
  dice: HTMLElement;
}

/**
 * Render the skill-check result chip and expose its dice face.
 * @param result - The roll to display
 * @returns The chip root and its dice-face element
 */
export function renderSkillCheckChip(result: SkillCheckResult,): SkillCheckChip {
  const root = document.createElement("span",);
  root.className = "battle-skill-check";
  root.setAttribute("role", "status",);
  root.setAttribute("aria-live", "polite",);

  const dice = document.createElement("span",);
  dice.className = "battle-dice";
  dice.textContent = String(result.roll,);
  root.append(dice,);

  const math = document.createElement("span",);
  math.className = "battle-skill-check-math";
  const sign = result.modifier >= 0 ? "+" : "";
  math.textContent = t("battle.rollResult", {
    roll: result.roll,
    modifier: `${sign}${result.modifier}`,
    total: result.total,
    dc: result.dc,
  },);

  root.append(math,);

  const outcome = document.createElement("span",);
  outcome.className = "battle-skill-check-outcome";
  const success = result.total >= result.dc;
  outcome.textContent = success ? t("battle.rollSuccess",) : t("battle.rollFailure",);
  if (result.critical === "hit") { outcome.classList.add("battle-critical-hit",); }
  if (result.critical === "fail") { outcome.classList.add("battle-critical-fail",); }
  root.append(outcome,);

  return { root, dice, };
}

/**
 * Render the skill-check result chip.
 * @param result - The roll to display
 * @returns The chip element
 */
export function renderSkillCheckResult(result: SkillCheckResult,): HTMLElement {
  return renderSkillCheckChip(result,).root;
}

export function setDiceRolling(dice: HTMLElement, rolling: boolean,): void {
  if (rolling) {
    dice.classList.add("battle-dice-rolling",);
  } else {
    dice.classList.remove("battle-dice-rolling",);
  }
}
