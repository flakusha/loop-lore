// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Interaction Panel — VN-style turn-based combat surface.
 *
 * Renders the active chat battle (roster + action bar) and lets the user act
 * on it with mouse or keyboard, reusing the VN choice-card interaction model:
 *
 *   Mouse  — click a combatant tile to select it as the target, click an
 *            action (Attack / Heal / End) to execute it.
 *   Keys   — ←/→ cycle focus through combatants + actions, Enter/Space
 *            triggers the focused element, Esc clears the selection.
 *
 * Commands are dispatched by sending slash commands through the chat's
 * existing message path (the `/attack`, `/heal`, `/battle` handlers), so the
 * panel needs no new server API.
 *
 * Split across:
 * - `commands.ts` — pure types + `battleCommandFor` command mapping (tested)
 * - `render.ts`   — DOM builders (header / roster / action bar)
 */

import {
  type BattleActionKind,
  battleCommandFor,
  battleItemCommandFor,
  type BattleItemView,
  type BattleView,
} from "./commands.js";

import { buildFocusTargets, handlePanelKey, type PanelFocusDeps, rebuildFocus, } from "./panel-focus.js";
import {
  type BattleRenderCallbacks,
  renderActions,
  renderHeader,
  renderItems,
  renderRoster,
} from "./render.js";

export {
  type BattleActionKind,
  type BattleCombatantView,
  battleCommandFor,
  type BattleItemView,
  type BattleView,
} from "./commands.js";

/** Bridge the battle panel to the host chat component. */
export interface BattlePanelContext {
  /** Send a slash command through the chat's message path. */
  sendCommand: (command: string,) => Promise<void>;
}

let container: HTMLElement | null = null;
let ctx: BattlePanelContext | null = null;
let keyHandler: ((e: KeyboardEvent,) => void) | null = null;

/** Panel state + actions, shared with the keyboard-focus module. */
const deps: PanelFocusDeps = {
  selectedTargetId: null,
  itemsOpen: false,
  battle: null,
  focusTargets: [],
  focusedIndex: 0,
  render,
  toggleItems,
  dispatchItem,
  executeAction,
};

/**
 * Mount the battle panel into a container.
 * @param containerEl - DOM element to render into
 * @param battleCtx - Send bridge + option access
 * @returns {void}
 */
export function mountBattlePanel(
  containerEl: HTMLElement,
  battleCtx: BattlePanelContext,
): void {
  container = containerEl;
  ctx = battleCtx;
  container.classList.add("battle-panel",);
  keyHandler = (e: KeyboardEvent,) => handlePanelKey(e, deps,);
  container.addEventListener("keydown", keyHandler,);
  render();
}

/**
 * Destroy the battle panel, detaching listeners and clearing state.
 * @returns {void}
 */
export function destroyBattlePanel(): void {
  if (container && keyHandler) {
    container.removeEventListener("keydown", keyHandler,);
  }

  container = null;
  ctx = null;
  deps.battle = null;
  deps.selectedTargetId = null;
  deps.itemsOpen = false;
  deps.focusTargets = [];
  deps.focusedIndex = 0;
  keyHandler = null;
}

/**
 * Render (or update) the battle from a command response payload.
 * @param view The battle state serialized by a `battle-*` command action
 * @returns {void}
 */
export function renderBattle(view: BattleView,): void {
  deps.battle = view;
  deps.selectedTargetId = null;
  deps.itemsOpen = false;
  if (deps.battle.status === "active") {
    buildFocusTargets(deps,);
  } else {
    deps.focusTargets = [];
  }

  render();
}

/**
 * Re-render from the last battle state (used after a command completes).
 * @returns {void}
 */
export function refreshBattle(): void {
  render();
}

// ── Rendering ──────────────────────────────────────────

/** */
function render(): void {
  if (!container) { return; }

  container.replaceChildren();

  if (!deps.battle) {
    const hint = document.createElement("div",);
    hint.className = "battle-panel-empty";
    hint.textContent = "No active battle. Start one with /battle start.";
    container.append(hint,);
    return;
  }

  const overlay = document.createElement("div",);
  overlay.className = "battle-panel-content";
  overlay.tabIndex = 0; // make the panel focusable for keyboard nav
  overlay.setAttribute("role", "group",);
  overlay.setAttribute("aria-label", "Battle controls",);

  const callbacks: BattleRenderCallbacks = {
    select: (id,) => {
      deps.selectedTargetId = deps.selectedTargetId === id ? null : id;
      rebuildFocus(deps,);
      render();
    },
    execute: (kind,) => {
      void executeAction(kind,);
    },
    toggleItems,
    executeItem: (item,) => {
      void dispatchItem(item,);
    },
  };

  overlay.append(
    renderHeader(deps.battle,),
    renderRoster(deps.battle, deps.selectedTargetId, callbacks,),
    renderActions(deps.battle, deps.itemsOpen, deps.selectedTargetId, callbacks,),
  );

  if (deps.itemsOpen) {
    const items = renderItems(deps.battle, callbacks,);
    if (items) { overlay.append(items,); }
  }

  // Focus the current cycle target once mounted.
  const active = deps.focusTargets[deps.focusedIndex];
  if (active) {
    const selector = active.type === "combatant"
      ? `[data-battle-id="${CSS.escape(active.id,)}"]`
      : active.type === "item"
      ? `[data-battle-item="${CSS.escape(active.id,)}"]`
      : `[data-battle-action="${active.kind}"]`;

    overlay.querySelector<HTMLElement>(selector,)?.focus();
  }

  container.append(overlay,);
}

// ── Action execution ───────────────────────────────────

/**
 * @param kind
 */
async function executeAction(kind: BattleActionKind,): Promise<void> {
  if (!ctx) { return; }
  const command = battleCommandFor(kind, deps.selectedTargetId, deps.battle?.combatants ?? [],);
  if (command) { await ctx.sendCommand(command,); }
}

/** Toggle the battle-item menu, then rebuild focus around its rows. */
function toggleItems(): void {
  deps.itemsOpen = !deps.itemsOpen;
  rebuildFocus(deps,);
  render();
}

/**
 * Use a battle item on the current selection, then close the item menu.
 * @param item - The item row that was activated
 */
async function dispatchItem(item: BattleItemView,): Promise<void> {
  if (!ctx) { return; }
  const command = battleItemCommandFor(item, deps.selectedTargetId, deps.battle?.combatants ?? [],);
  if (!command) { return; }
  deps.itemsOpen = false;
  rebuildFocus(deps,);
  render();
  await ctx.sendCommand(command,);
}
