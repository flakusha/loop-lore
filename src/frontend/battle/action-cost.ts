// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — action cost + cooldown display.
 */

export interface ActionCost {
  cost?: number;
  cooldown?: number;
}

export function renderActionCost(cost: ActionCost,): HTMLElement | null {
  if (cost.cost === undefined && cost.cooldown === undefined) { return null; }

  const span = document.createElement("span",);
  span.className = "battle-action-cost";
  const parts: string[] = [];
  if (cost.cost !== undefined) { parts.push(`${cost.cost} AP`,); }

  if (cost.cooldown !== undefined && cost.cooldown > 0) { parts.push(`${cost.cooldown}t cooldown`,); }

  span.textContent = parts.join(" · ",);

  return span;
}
