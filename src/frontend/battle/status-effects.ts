// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — status-effect badges.
 *
 * Renders the conditions the backend delivers per combatant as a badge row
 * for the roster tiles. Pure DOM builder, styled by the `.battle-status-*`
 * CSS; unit-tested in status-effects.test.ts.
 */

import { t, } from "../alpine/i18n";

/**
 * Render a combatant's active status-effect badges.
 * @param conditions - The conditions delivered by the backend payload
 * @returns {HTMLElement | null} The `.battle-status-effects` badge row, or null when the combatant has no conditions
 */
export function renderStatusEffects(conditions: string[],): HTMLElement | null {
  if (conditions.length === 0) { return null; }

  const row = document.createElement("span",);
  row.className = "battle-status-effects";
  row.setAttribute("role", "list",);
  row.setAttribute("aria-label", t("battle.statusEffects",),);

  for (const condition of conditions) {
    const badge = document.createElement("span",);
    badge.className = "battle-status-badge";
    badge.setAttribute("role", "listitem",);
    // Tooltip (native `title`) + accessible name both carry the condition.
    badge.setAttribute("title", condition,);
    badge.setAttribute("aria-label", condition,);
    badge.textContent = condition;
    row.append(badge,);
  }

  return row;
}
