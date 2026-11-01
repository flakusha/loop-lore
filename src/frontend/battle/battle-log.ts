// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — battle log viewer.
 *
 * Renders the battle history the backend delivers in the panel payload as a
 * scrollable, keyboard-focusable log (role="log"). The container is focused
 * via the panel's keyboard cycle only implicitly (tabindex), and arrow keys
 * scroll a focused overflow box natively. Pure DOM builder styled by the
 * `.battle-log*` CSS; unit-tested in battle-log.test.ts.
 */

import { t, } from "../alpine/i18n";
import { type BattleLogEntryView, } from "./commands.js";

/**
 * Map a log entry's action type to a safe class suffix: lowercase action
 * types pass through; anything else is stripped to alphanumerics/underscore
 * so a malformed payload cannot inject class names.
 * @param type - The combat action type from the payload
 * @returns {string} A `battle-log-entry` class-list suffix ("" when nothing survives)
 */
export function logTypeClass(type: string,): string {
  const safe = type.toLowerCase().replace(/[^a-z_]/g, "",);
  return safe ? ` is-${safe}` : "";
}

/**
 * Scroll a log container so its latest (bottom-most) entry is visible.
 * @param el - The `.battle-log` scroll container
 */
export function scrollToLatest(el: HTMLElement,): void {
  el.scrollTop = el.scrollHeight;
}

/**
 * Render the battle log panel from the delivered history.
 * @param log - The battle-log entries delivered by the backend payload
 * @returns {HTMLElement | null} The `.battle-log` container, or null when there is no history yet
 */
export function renderBattleLog(log: BattleLogEntryView[],): HTMLElement | null {
  if (log.length === 0) { return null; }

  const panel = document.createElement("div",);
  panel.className = "battle-log";
  panel.setAttribute("role", "log",);
  panel.setAttribute("aria-live", "polite",);
  panel.setAttribute("aria-label", t("battle.log",),);
  // Focusable so keyboard users can arrow-scroll the overflow box.
  panel.tabIndex = 0;

  for (const entry of log) {
    const line = document.createElement("span",);
    line.className = `battle-log-entry${logTypeClass(entry.type,)}`;
    line.dataset.logType = entry.type;
    if (entry.critical === true) {
      line.classList.add("is-critical",);
      const crit = document.createElement("span",);
      crit.className = "battle-log-crit";
      crit.setAttribute("aria-hidden", "true",);
      crit.textContent = "✦";
      line.append(crit,);
    }

    if (entry.damage !== undefined) {
      const damage = document.createElement("span",);
      damage.className = "battle-log-damage";
      damage.textContent = String(entry.damage,);
      line.append(damage,);
    }

    const text = document.createElement("span",);
    text.className = "battle-log-text";
    text.textContent = entry.description;
    line.append(text,);

    panel.append(line,);
  }

  scrollToLatest(panel,);

  return panel;
}
