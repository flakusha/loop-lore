// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard navigation for the battle panel — split from `panel.ts` so each
 * file stays under the 250L gate. All panel state stays in `panel.ts`; this
 * module reads and mutates it through the {@link PanelFocusDeps} seam.
 */

import {
  ACTIONS,
  type BattleActionKind,
  type BattleFocusTarget,
  type BattleView,
  SOCIAL_ACTIONS,
} from "./commands.js";

/** Access to panel state + actions the keyboard handlers need. */
export interface PanelFocusDeps {
  /** Currently selected combatant id (null = none). */
  selectedTargetId: string | null;
  /** Whether the battle-item menu is open. */
  itemsOpen: boolean;
  /** Last known battle view (null = empty panel). */
  battle: BattleView | null;
  /** Focus-cycle targets in tab order. */
  focusTargets: BattleFocusTarget[];
  /** Index into `focusTargets` currently focused. */
  focusedIndex: number;
  /** Re-render the panel. */
  render(): void;
  /** Toggle the battle-item menu. */
  toggleItems(): void;
  /** Use a battle item on the current selection. */
  dispatchItem(item: BattleView["items"][number],): Promise<void>;
  /** Execute a panel action. */
  executeAction(kind: BattleActionKind,): Promise<void>;
}

/**
 * Handle a keydown on the panel: Escape clears selection, arrows cycle the
 * focus targets, Enter/Space activate the focused target.
 * @param e - The keydown event
 * @param deps - Panel state + actions
 */
export function handlePanelKey(e: KeyboardEvent, deps: PanelFocusDeps,): void {
  if (e.key === "Escape") {
    deps.selectedTargetId = null;
    rebuildFocus(deps,);
    deps.render();
    return;
  }

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",].includes(e.key,)) {
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const len = Math.max(1, deps.focusTargets.length,);
    deps.focusedIndex = ((deps.focusedIndex + dir) % len + len) % len;
    rebuildFocus(deps,);
    deps.render();
    return;
  }

  if (e.key === "Enter" || e.key === " ") {
    activateFocused(deps,);
  }
}

/** Activate the focused cycle target (Enter/Space): select, dispatch, or toggle.
 * @param deps - panel state + actions.
 */
function activateFocused(deps: PanelFocusDeps,): void {
  const active = deps.focusTargets[deps.focusedIndex];
  if (active?.type === "combatant") {
    // Combatant tile — toggle selection.
    deps.selectedTargetId = deps.selectedTargetId === active.id ? null : active.id;
    rebuildFocus(deps,);
    deps.render();
    return;
  }

  if (active?.type === "item") {
    const item = deps.battle?.items.find((i,) => i.id === active.id);
    if (item) { void deps.dispatchItem(item,); }
    return;
  }

  if (active?.type === "action") {
    if (active.kind === "item") {
      deps.toggleItems();
    } else {
      void deps.executeAction(active.kind,);
    }
  }
}

/** Order the focus cycle: combatants first (in roster order), then actions.
 * @param deps - panel state + actions.
 */
export function buildFocusTargets(deps: PanelFocusDeps,): void {
  deps.focusTargets = [];
  if (!deps.battle) { return; }
  for (const c of deps.battle.combatants) {
    if (c.hp > 0) { deps.focusTargets.push({ type: "combatant", id: c.id, },); }
  }

  for (const a of ACTIONS) { deps.focusTargets.push({ type: "action", kind: a.kind, },); }
  deps.focusTargets.push({ type: "action", kind: "item", },);
  for (const s of SOCIAL_ACTIONS) { deps.focusTargets.push({ type: "action", kind: s.kind, },); }
  if (deps.itemsOpen) {
    for (const item of deps.battle.items) { deps.focusTargets.push({ type: "item", id: item.id, },); }
  }

  deps.focusedIndex = Math.min(deps.focusedIndex, Math.max(0, deps.focusTargets.length - 1,),);
}

/**
 * @param a - Candidate target
 * @param b - Previously focused target
 * @returns true when two focus targets refer to the same element.
 */
function sameTarget(a: BattleFocusTarget, b: BattleFocusTarget,): boolean {
  if (a.type !== b.type) { return false; }
  if (a.type === "combatant" && b.type === "combatant") {
    return a.id === b.id;
  }

  if (a.type === "action" && b.type === "action") {
    return a.kind === b.kind;
  }

  if (a.type === "item" && b.type === "item") {
    return a.id === b.id;
  }

  return false;
}

/** Rebuild focus targets, preserving the current focus if still valid.
 * @param deps - panel state + actions.
 */
export function rebuildFocus(deps: PanelFocusDeps,): void {
  const prev = deps.focusTargets[deps.focusedIndex];
  buildFocusTargets(deps,);
  if (!prev) { return; }
  const idx = deps.focusTargets.findIndex((t,) => sameTarget(t, prev,));
  if (idx !== -1) { deps.focusedIndex = idx; }
}
