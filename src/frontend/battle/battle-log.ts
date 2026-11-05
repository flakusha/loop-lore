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
import { renderSkillCheckChip, type SkillCheckChip, } from "./skill-check-display.js";
import { animateDiceRoll, } from "./skill-check.js";

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
 * The newest animated roll, scoped to its battle.
 *
 * The guard is module-level because the panel re-renders wholesale on every
 * state change; the battle id keeps one battle from inheriting another's
 * guard, so a new battle always tumbles its first roll.
 */
let lastAnimatedRoll: { battleId: string; signature: string } | null = null;

/**
 * Build the roll chip for a log entry.
 * @param entry - The battle-log entry
 * @returns The chip, or null when the entry carries no roll
 */
function rollChip(entry: BattleLogEntryView,): SkillCheckChip | null {
  const roll = entry.roll;
  if (!roll) { return null; }

  const chip = renderSkillCheckChip({
    roll: roll.natural,
    modifier: roll.modifier,
    total: roll.total,
    dc: roll.dc,
    critical: entry.critical ? "hit" : null,
  },);

  // The enclosing role="log" region announces the new line; the chip must not
  // announce itself a second time.
  chip.root.setAttribute("aria-live", "off",);

  return chip;
}

/**
 * Tumble the newest roll's dice, once per new roll.
 *
 * The panel re-renders wholesale on every state change, so the tumble is
 * gated on the roll's signature: re-rendering the same log keeps the dice
 * still on the final value.
 * @param entry - The log entry carrying the newest roll
 * @param chip - The chip rendered for that entry
 * @param index - The entry's position in the log
 * @param battleId - The battle the log belongs to
 */
function animateRoll(entry: BattleLogEntryView, chip: SkillCheckChip, index: number, battleId: string,): void {
  const roll = entry.roll;
  if (!roll) { return; }

  const signature = `${index}|${entry.description}|${roll.natural}|${roll.total}|${roll.dc}|${entry.critical}`;

  if (lastAnimatedRoll?.battleId === battleId && lastAnimatedRoll.signature === signature) { return; }
  lastAnimatedRoll = { battleId, signature, };
  animateDiceRoll(chip.dice, roll.natural,);
}

/**
 * Render the battle log panel from the delivered history.
 * @param log - The battle-log entries delivered by the backend payload
 * @param battleId - The battle the log belongs to (scopes the dice-tumble guard)
 * @returns {HTMLElement | null} The `.battle-log` container, or null when there is no history yet
 */
export function renderBattleLog(log: BattleLogEntryView[], battleId = "",): HTMLElement | null {
  if (log.length === 0) { return null; }

  const panel = document.createElement("div",);
  panel.className = "battle-log";
  panel.setAttribute("role", "log",);
  panel.setAttribute("aria-live", "polite",);
  panel.setAttribute("aria-label", t("battle.log",),);
  // Focusable so keyboard users can arrow-scroll the overflow box.
  panel.tabIndex = 0;

  let newestEntry: BattleLogEntryView | null = null;
  let newestChip: SkillCheckChip | null = null;
  let newestIndex = -1;

  for (const [index, entry,] of log.entries()) {
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

    const chip = rollChip(entry,);
    if (chip) {
      line.append(chip.root,);
      newestEntry = entry;
      newestChip = chip;
      newestIndex = index;
    }

    panel.append(line,);
  }

  if (newestEntry && newestChip) { animateRoll(newestEntry, newestChip, newestIndex, battleId,); }

  scrollToLatest(panel,);

  return panel;
}
