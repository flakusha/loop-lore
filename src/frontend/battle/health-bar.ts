// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — reusable health-bar widget.
 *
 * Renders the HP progress bar as a standalone element so systems beyond the
 * battle roster (the epic's shared-component table lists NSFW and NPC
 * surfaces) can drop it into any container. Pure DOM builder: takes current +
 * maximum HP, returns an accessible `progressbar` span styled by the
 * existing `.battle-hp-bar` CSS. Unit-tested in health-bar.test.ts.
 */

import { t, } from "../alpine/i18n";
import { hpPercent, } from "./commands.js";

/** Optional overrides for the health-bar builder. */
export interface HealthBarOptions {
  /** Accessible name for the bar; defaults to `t("battle.health")`. */
  label?: string;
}

/**
 * Render an HP progress bar for a combatant (or any hp/maxHp pair).
 *
 * The percentage is clamped to 0–100 by `hpPercent`, so negative and
 * over-maximum inputs render pinned endpoints instead of overflowing widths.
 * @param hp - Current hit points (negatives clamp to 0%)
 * @param maxHp - Maximum hit points (0 or less renders 0%)
 * @param options - Label override and future display options
 * @returns {HTMLElement} The `.battle-hp-bar` progressbar element
 */
export function renderHealthBar(
  hp: number,
  maxHp: number,
  options: HealthBarOptions = {},
): HTMLElement {
  const pct = hpPercent(hp, maxHp,);
  const bar = document.createElement("span",);
  bar.className = "battle-hp-bar";
  bar.setAttribute("role", "progressbar",);
  bar.setAttribute("aria-label", options.label ?? t("battle.health",),);
  bar.setAttribute("aria-valuenow", String(pct,),);
  bar.setAttribute("aria-valuemin", "0",);
  bar.setAttribute("aria-valuemax", "100",);
  bar.style.width = `${pct}%`;

  return bar;
}
