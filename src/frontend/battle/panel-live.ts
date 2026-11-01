// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — screen-reader announcements and page-level keynav slots.
 *
 * Split from `panel.ts` (250L gate). Owns the aria-live announcer node that
 * survives the panel's full re-renders, the 1-9 action-slot dispatcher
 * (epic-accessibility-input battle shortcuts), and the keynav handler
 * registration lifecycle (opt-in keymap, see alpine/shortcuts.ts). All
 * panel state stays in `panel.ts` behind {@link PanelFocusDeps}.
 */
import { registerKeynavHandler, } from "../alpine/shortcuts.js";
import { type BattleActionKind, battleAnnouncement, enabledActionSlots, } from "./commands.js";
import type { PanelFocusDeps, } from "./panel-focus.js";

/** Digit keymap actions the battle panel consumes (`battle-slot-1..9`). */
export const BATTLE_SLOT_ACTIONS: readonly string[] = Array.from(
  { length: 9, },
  (_, i,) => `battle-slot-${i + 1}`,
);

/** The persistent aria-live node plus the last text it announced. */
export interface BattleAnnouncer {
  node: HTMLElement;
  /** Previously announced text; empty = nothing announced yet. */
  last: string;
}

/**
 * Create the panel's live-region announcer (visually hidden, polite).
 * Created once per mount and re-appended across renders so screen readers
 * keep tracking the same node instead of seeing it replaced.
 * @returns Announcer state
 */
export function createBattleAnnouncer(): BattleAnnouncer {
  const node = document.createElement("div",);
  node.className = "sr-only";
  node.setAttribute("aria-live", "polite",);
  node.setAttribute("aria-atomic", "true",);
  node.setAttribute("data-testid", "battle-announcer",);
  return { node, last: "", };
}

/**
 * Update the announcer when the battle announcement changed. Renders wipe
 * and rebuild the panel DOM; the announcer node object persists, so only
 * real state changes (round / turn / battle end) are announced.
 * @param state - Announcer state
 * @param battle - Current battle view or null
 * @returns {void}
 */
export function announceBattle(
  state: BattleAnnouncer,
  battle: PanelFocusDeps["battle"],
): void {
  const message = battleAnnouncement(battle,);
  if (message === state.last) { return; }
  state.last = message;
  state.node.textContent = message;
}

/**
 * Activate the Nth enabled action in the battle-action bar (slot 1-9),
 * mirroring bar order: ACTIONS, then Item, then the social verbs. No-op
 * when the slot is out of range, the battle is inactive, or the action at
 * that slot is disabled.
 * @param deps - Panel state + actions
 * @param slot - 1-based action slot
 * @returns {void}
 */
export function selectBattleActionSlot(deps: PanelFocusDeps, slot: number,): void {
  if (!deps.battle || deps.battle.status !== "active" || slot < 1) { return; }
  const kind: BattleActionKind | undefined = enabledActionSlots(
    deps.battle,
    deps.selectedTargetId,
  )[slot - 1];

  if (!kind) { return; }

  if (kind === "item") {
    deps.toggleItems();
    return;
  }

  void deps.executeAction(kind,);
}

/**
 * Register keynav handlers for the battle-slot actions. Returns an
 * unsubscribe function; panel destroy calls it so the digit keys go inert
 * when no battle panel is mounted.
 * @param deps - Panel state + actions
 * @returns Unsubscribe function
 */
export function registerBattleSlotHandlers(deps: PanelFocusDeps,): () => void {
  const unsubs = BATTLE_SLOT_ACTIONS.map((action, i,) =>
    registerKeynavHandler(action, () => selectBattleActionSlot(deps, i + 1,),)
  );

  return () => {
    for (const unsub of unsubs) { unsub(); }
  };
}
