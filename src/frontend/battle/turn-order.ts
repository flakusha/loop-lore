// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — turn-order strip.
 *
 * The battle service delivers the roster in initiative order with `turnIndex`
 * pointing at the acting combatant, so the upcoming-turn queue is derivable
 * client-side without new backend data: act first, then the remaining
 * combatants wrapping around the roster. Pure DOM builder, unit-tested in
 * turn-order.test.ts.
 */

import { t, } from "../alpine/i18n";
import type { BattleView, } from "./commands.js";

/** One entry in the acting-first turn queue. */
export interface TurnOrderEntry {
  /** Combatant display name. */
  name: string;
  /** Initiative roll (display-only context for the order). */
  initiative: number;
  /** Whether this entry is the currently acting combatant. */
  acting: boolean;
  /** Whether this combatant is down (hp ≤ 0). */
  dead: boolean;
}

/**
 * Build the acting-first turn queue from the initiative-ordered roster.
 *
 * Entry `i` is the combatant that acts `i` turns from now (wrapping the
 * roster), so `queue[0]` is always the combatant at `battle.turnIndex`.
 * @param battle - The battle whose roster orders the queue
 * @returns {TurnOrderEntry[]} The queue in acting order (empty for an empty roster)
 */
export function turnQueue(battle: BattleView,): TurnOrderEntry[] {
  const total = battle.combatants.length;
  const queue: TurnOrderEntry[] = [];
  // Normalize an out-of-range turnIndex (e.g. negative from a malformed
  // payload) so the modulo lookup always lands inside the roster.
  const start = total > 0 ? ((battle.turnIndex % total) + total) % total : 0;
  for (let offset = 0; offset < total; offset++) {
    const c = battle.combatants[(start + offset) % total]!;
    queue.push({
      name: c.name,
      initiative: c.initiative,
      acting: offset === 0,
      dead: c.hp <= 0,
    },);
  }

  return queue;
}

/**
 * Render the turn-order strip: a label plus one chip per upcoming actor,
 * the acting combatant first and marked with the panel's ➤ acting glyph.
 * @param battle - The battle to display
 * @returns {HTMLElement} The `.battle-turn-order` container
 */
export function renderTurnOrder(battle: BattleView,): HTMLElement {
  const wrap = document.createElement("div",);
  wrap.className = "battle-turn-order";
  wrap.setAttribute("role", "group",);
  wrap.setAttribute("aria-label", t("battle.turnOrder",),);

  const label = document.createElement("span",);
  label.className = "battle-turn-order-label";
  label.textContent = t("battle.turnOrder",);
  wrap.append(label,);

  const queue = document.createElement("div",);
  queue.className = "battle-turn-queue";
  queue.setAttribute("role", "list",);

  for (const entry of turnQueue(battle,)) {
    const classes = ["battle-turn-entry",];
    if (entry.acting) { classes.push("is-acting",); }
    if (entry.dead) { classes.push("is-dead",); }

    const chip = document.createElement("span",);
    chip.className = classes.join(" ",);
    chip.setAttribute("role", "listitem",);
    if (entry.acting) { chip.setAttribute("aria-current", "true",); }
    chip.textContent = `${entry.acting ? "➤ " : ""}${entry.name} · ${entry.initiative}`;
    queue.append(chip,);
  }

  wrap.append(queue,);

  return wrap;
}
