// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — DOM renderers.
 *
 * Pure-ish builders: take the battle view + selected-target state +
 * interaction callbacks, return rendered DOM nodes. Kept apart from
 * `panel.ts` (mount/state/keyboard) so each file stays under 250L.
 */

import {
  ACTIONS,
  type BattleActionKind,
  type BattleView,
  escapeHtml,
  hpPercent,
} from "./commands.js";

export interface BattleRenderCallbacks {
  /** Toggle target selection for a combatant id (null = clear). */
  select: (id: string,) => void;
  /** Execute a battle action (attack/heal/end). */
  execute: (kind: BattleActionKind,) => void;
}

export function renderHeader(battle: BattleView,): HTMLElement {
  const h = document.createElement("div",);
  h.className = "battle-panel-header";
  h.innerHTML = `<strong>Round ${battle.round}</strong> <span class="battle-panel-status">${
    escapeHtml(battle.status,)
  }</span>`;
  return h;
}

export function renderRoster(
  battle: BattleView,
  selectedTargetId: string | null,
  callbacks: BattleRenderCallbacks,
): HTMLElement {
  const list = document.createElement("div",);
  list.className = "battle-roster";
  list.setAttribute("role", "list",);

  let i = 0;
  for (const c of battle.combatants) {
    const acting = i === battle.turnIndex;
    const dead = c.hp <= 0;

    const tile = document.createElement("button",);
    tile.type = "button";
    const classes = [acting ? "is-acting" : "", dead ? "is-dead" : "", selectedTargetId === c.id ? "is-selected" : "",];
    const classNameParts = ["battle-combatant",];
    for (const cls of classes) {
      if (cls) { classNameParts.push(cls,); }
    }
    tile.className = classNameParts.join(" ",);
    tile.dataset.battleId = c.id;
    tile.setAttribute("role", "listitem",);
    if (acting) { tile.setAttribute("aria-current", "true",); }
    tile.disabled = dead;

    const pct = hpPercent(c.hp, c.maxHp,);
    tile.innerHTML = `
      <span class="battle-combatant-name">${escapeHtml(c.name,)}${acting ? " ➤" : ""}</span>
      <span class="battle-hp">${escapeHtml(String(Math.max(0, c.hp,),),)}/${escapeHtml(String(c.maxHp,),)}</span>
      <span class="battle-hp-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="width:${pct}%"></span>
    `;

    tile.addEventListener("click", () => {
      if (dead) { return; }
      callbacks.select(c.id,);
    },);

    list.append(tile,);
    i++;
  }
  return list;
}

export function renderActions(
  selectedTargetId: string | null,
  callbacks: BattleRenderCallbacks,
): HTMLElement {
  const bar = document.createElement("div",);
  bar.className = "battle-actions";
  bar.setAttribute("role", "toolbar",);
  bar.setAttribute("aria-label", "Battle actions",);

  for (const action of ACTIONS) {
    const btn = document.createElement("button",);
    btn.type = "button";
    btn.className = "battle-action";
    btn.dataset.battleAction = action.kind;
    btn.textContent = action.label;
    btn.disabled = action.kind !== "end" && !selectedTargetId;

    btn.addEventListener("click", () => {
      callbacks.execute(action.kind,);
    },);

    bar.append(btn,);
  }
  return bar;
}
