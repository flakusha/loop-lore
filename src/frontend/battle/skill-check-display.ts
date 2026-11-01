// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export interface SkillCheckResult {
  roll: number;
  modifier: number;
  total: number;
  dc: number;
  critical?: "hit" | "fail" | null;
}

export function renderSkillCheckResult(result: SkillCheckResult,): HTMLElement {
  const root = document.createElement("div",);
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
  math.textContent = `${result.roll} ${sign}${result.modifier} = ${result.total} vs DC ${result.dc}`;
  root.append(math,);

  const outcome = document.createElement("span",);
  outcome.className = "battle-skill-check-outcome";
  const success = result.total >= result.dc;
  outcome.textContent = success ? "success" : "failure";
  if (result.critical === "hit") { outcome.classList.add("battle-critical-hit",); }
  if (result.critical === "fail") { outcome.classList.add("battle-critical-fail",); }
  root.append(outcome,);

  return root;
}

export function setDiceRolling(dice: HTMLElement, rolling: boolean,): void {
  if (rolling) {
    dice.classList.add("battle-dice-rolling",);
  } else {
    dice.classList.remove("battle-dice-rolling",);
  }
}
