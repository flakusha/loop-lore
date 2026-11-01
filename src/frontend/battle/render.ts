// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — DOM renderers.
 *
 * Pure-ish builders: take the battle view + selected-target state +
 * interaction callbacks, return rendered DOM nodes. Kept apart from
 * `panel.ts` (mount/state/keyboard) so each file stays under 250L.
 */

import { t, } from "../alpine/i18n";
import {
  actionAvailable,
  ACTIONS,
  type BattleActionKind,
  type BattleCombatantView,
  type BattleItemView,
  type BattleView,
  escapeHtml,
  SOCIAL_ACTIONS,
} from "./commands.js";
import { renderEnvironmentalEffects, } from "./environmental-effects.js";
import { renderHealthBar, } from "./health-bar.js";
import { renderStatusEffects, } from "./status-effects.js";

/** */
export interface BattleRenderCallbacks {
  /** Toggle target selection for a combatant id (null = clear). */
  select: (id: string,) => void;
  /** Execute a battle action (attack/heal/end/social-*). */
  execute: (kind: BattleActionKind,) => void;
  /** Toggle the battle-item menu. */
  toggleItems: () => void;
  /** Use a battle item on the selected target (or the actor itself). */
  executeItem: (item: BattleItemView,) => void;
}

/**
 * @param battle
 * @returns {HTMLElement}
 */
export function renderHeader(battle: BattleView,): HTMLElement {
  const h = document.createElement("div",);
  h.className = "battle-panel-header";
  h.innerHTML = `<strong>Round ${battle.round}</strong> <span class="battle-panel-status">${
    escapeHtml(battle.status,)
  }</span>`;

  const effects = renderEnvironmentalEffects(battle.environmentalEffects ?? [],);
  if (effects) { h.append(effects,); }

  return h;
}

/**
 * Render the acting combatant's remaining action economy.
 * @param c Combatant view (economy fields delivered only when the backend tracks them)
 * @returns The economy line, or null when the backend delivered no economy fields
 */
function renderActionEconomy(c: BattleCombatantView,): HTMLElement | null {
  if (c.actions === undefined && c.bonusActions === undefined && c.reactions === undefined) { return null; }
  const line = document.createElement("span",);
  line.className = "battle-action-economy";
  const parts: string[] = [];
  if (c.actions !== undefined) { parts.push(`${c.actions} action${c.actions === 1 ? "" : "s"}`,); }
  if (c.bonusActions !== undefined) { parts.push(`${c.bonusActions} bonus`,); }
  if (c.reactions !== undefined) { parts.push(`${c.reactions} reaction${c.reactions === 1 ? "" : "s"}`,); }
  line.textContent = parts.join(" \u00b7 ",);
  return line;
}

/**
 * @param battle
 * @param selectedTargetId
 * @param callbacks
 * @returns {HTMLElement}
 */
export function renderRoster(
  battle: BattleView,
  selectedTargetId: string | null,
  callbacks: BattleRenderCallbacks,
): HTMLElement {
  const list = document.createElement("div",);
  list.className = "battle-roster";
  list.setAttribute("role", "group",);
  list.setAttribute("aria-label", t("battle.targetSelection",),);

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
    tile.setAttribute("aria-pressed", String(selectedTargetId === c.id,),);
    if (acting) { tile.setAttribute("aria-current", "true",); }
    tile.disabled = dead;

    tile.innerHTML = `
      <span class="battle-combatant-name">${escapeHtml(c.name,)}${acting ? " ➤" : ""}</span>
      <span class="battle-hp">${escapeHtml(String(Math.max(0, c.hp,),),)}/${escapeHtml(String(c.maxHp,),)}</span>
    `;

    tile.append(renderHealthBar(c.hp, c.maxHp,),);
    const badges = renderStatusEffects(c.conditions,);
    if (badges) { tile.append(badges,); }
    const economy = renderActionEconomy(c,);
    if (economy) { tile.append(economy,); }

    tile.addEventListener("click", () => {
      if (dead) { return; }
      callbacks.select(c.id,);
    },);

    list.append(tile,);
    i++;
  }

  return list;
}

/**
 * @param battle
 * @param itemsOpen
 * @param selectedTargetId
 * @param callbacks
 * @returns {HTMLElement}
 */
export function renderActions(
  battle: BattleView,
  itemsOpen: boolean,
  selectedTargetId: string | null,
  callbacks: BattleRenderCallbacks,
): HTMLElement {
  const bar = document.createElement("div",);
  bar.className = "battle-actions";
  bar.setAttribute("role", "toolbar",);
  bar.setAttribute("aria-label", t("battle.battleActions",),);

  const availability = {
    battleActive: battle.status === "active",
    hasTarget: selectedTargetId !== null,
    itemCount: battle.items.length,
  };

  const itemButton = (
    kind: BattleActionKind,
    label: string,
    onActivate: () => void,
    disabled: boolean,
  ): HTMLElement => {
    const btn = document.createElement("button",);
    btn.type = "button";
    btn.className = "battle-action";
    btn.dataset.battleAction = kind;
    btn.textContent = label;
    btn.disabled = disabled;
    if (kind === "item") { btn.setAttribute("aria-expanded", String(itemsOpen,),); }
    btn.addEventListener("click", onActivate,);
    return btn;
  };

  for (const action of ACTIONS) {
    bar.append(itemButton(
      action.kind,
      action.label,
      () => callbacks.execute(action.kind,),
      !actionAvailable(action.kind, availability,),
    ),);
  }

  bar.append(itemButton(
    "item",
    "Item",
    () => callbacks.toggleItems(),
    !actionAvailable("item", availability,),
  ),);

  for (const social of SOCIAL_ACTIONS) {
    bar.append(itemButton(
      social.kind,
      social.label,
      () => callbacks.execute(social.kind,),
      !actionAvailable(social.kind, availability,),
    ),);
  }

  return bar;
}

/**
 * Render the battle-item menu (the Item group's picker).
 * @param battle - The battle whose items are offered
 * @param callbacks - Interaction callbacks
 * @returns {HTMLElement | null} The item list, or null when there is nothing to show
 */
export function renderItems(
  battle: BattleView,
  callbacks: BattleRenderCallbacks,
): HTMLElement | null {
  if (battle.items.length === 0) { return null; }

  const list = document.createElement("div",);
  list.className = "battle-items";
  list.setAttribute("role", "group",);
  list.setAttribute("aria-label", t("battle.battleItems",),);

  for (const item of battle.items) {
    const row = document.createElement("button",);
    row.type = "button";
    row.className = "battle-action battle-item";
    row.dataset.battleItem = item.id;
    row.textContent = `${item.name} ×${item.quantity}`;
    row.disabled = battle.status !== "active";
    row.addEventListener("click", () => {
      callbacks.executeItem(item,);
    },);

    list.append(row,);
  }

  return list;
}
