// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — environmental effect display.
 *
 * Renders weather/terrain modifiers the backend delivers as a badge row.
 * Pure DOM builder; unit-tested in environmental-effects.test.ts.
 */

import { t, } from "../alpine/i18n";

export interface EnvironmentalEffect {
  name: string;
  description?: string;
}

/**
 * Render environmental effect badges.
 * @param effects - Effects delivered by the backend payload
 * @returns {HTMLElement | null} The badge row, or null when there are none
 */
export function renderEnvironmentalEffects(
  effects: EnvironmentalEffect[] | string[],
): HTMLElement | null {
  if (effects.length === 0) { return null; }

  const row = document.createElement("span",);
  row.className = "battle-environmental-effects";
  row.setAttribute("role", "list",);
  row.setAttribute("aria-label", t("battle.environmentalEffects",),);

  for (const effect of effects) {
    const name = typeof effect === "string" ? effect : effect.name;
    const description = typeof effect === "string" ? "" : (effect.description ?? "");

    const badge = document.createElement("span",);
    badge.className = "battle-environmental-badge";
    badge.setAttribute("role", "listitem",);
    badge.setAttribute("title", description || name,);
    badge.setAttribute("aria-label", name,);
    badge.textContent = name;
    row.append(badge,);
  }

  return row;
}
