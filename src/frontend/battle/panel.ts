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
  ACTIONS,
  type BattleActionKind,
  battleCommandFor,
  type BattleFocusTarget,
  type BattleView,
} from "./commands.js";

import {
  type BattleRenderCallbacks,
  renderActions,
  renderHeader,
  renderRoster,
} from "./render.js";

export {
  type BattleActionKind,
  type BattleCombatantView,
  battleCommandFor,
  type BattleView,
} from "./commands.js";

/** Bridge the battle panel to the host chat component. */
export interface BattlePanelContext {
  /** Send a slash command through the chat's message path. */
  sendCommand: (command: string,) => Promise<void>;
}

let container: HTMLElement | null = null;
let ctx: BattlePanelContext | null = null;
let battle: BattleView | null = null;
let selectedTargetId: string | null = null;
let focusedIndex = 0;
let focusTargets: BattleFocusTarget[] = [];
let keyHandler: ((e: KeyboardEvent,) => void) | null = null;

/**
 * Mount the battle panel into a container.
 *
 * @param containerEl - DOM element to render into
 * @param battleCtx - Send bridge + option access
 */
export function mountBattlePanel(
  containerEl: HTMLElement,
  battleCtx: BattlePanelContext,
): void {
  container = containerEl;
  ctx = battleCtx;
  container.classList.add("battle-panel",);
  keyHandler = (e: KeyboardEvent,) => handleKey(e,);
  container.addEventListener("keydown", keyHandler,);
  render();
}

/**
 * Destroy the battle panel, detaching listeners and clearing state.
 */
export function destroyBattlePanel(): void {
  if (container && keyHandler) {
    container.removeEventListener("keydown", keyHandler,);
  }
  container = null;
  ctx = null;
  battle = null;
  selectedTargetId = null;
  focusTargets = [];
  keyHandler = null;
}

/**
 * Render (or update) the battle from a command response payload.
 *
 * @param view The battle state serialized by a `battle-*` command action
 */
export function renderBattle(view: BattleView,): void {
  battle = view;
  selectedTargetId = null;
  if (battle.status === "active") {
    buildFocusTargets();
  } else {
    focusTargets = [];
  }
  render();
}

/**
 * Re-render from the last battle state (used after a command completes).
 */
export function refreshBattle(): void {
  render();
}

// ── Rendering ──────────────────────────────────────────

function render(): void {
  if (!container) { return; }

  container.replaceChildren();

  if (!battle) {
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
      selectedTargetId = selectedTargetId === id ? null : id;
      rebuildFocus();
      render();
    },
    execute: (kind,) => {
      void executeAction(kind,);
    },
  };
  overlay.append(
    renderHeader(battle,),
    renderRoster(battle, selectedTargetId, callbacks,),
    renderActions(selectedTargetId, callbacks,),
  );

  // Focus the current cycle target once mounted.
  const active = focusTargets[focusedIndex];
  if (active) {
    const selector = active.type === "combatant"
      ? `[data-battle-id="${CSS.escape(active.id,)}"]`
      : `[data-battle-action="${active.kind}"]`;
    overlay.querySelector<HTMLElement>(selector,)?.focus();
  }

  container.append(overlay,);
}

// ── Action execution ───────────────────────────────────

async function executeAction(kind: BattleActionKind,): Promise<void> {
  if (!ctx) { return; }
  const command = battleCommandFor(kind, selectedTargetId, battle?.combatants ?? [],);
  if (command) { await ctx.sendCommand(command,); }
}

// ── Keyboard navigation ────────────────────────────────

function handleKey(e: KeyboardEvent,): void {
  if (e.key === "Escape") {
    selectedTargetId = null;
    rebuildFocus();
    render();
    return;
  }

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",].includes(e.key,)) {
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const len = Math.max(1, focusTargets.length,);
    focusedIndex = ((focusedIndex + dir) % len + len) % len;
    rebuildFocus();
    render();
    return;
  }

  if (e.key === "Enter" || e.key === " ") {
    const active = focusTargets[focusedIndex];
    if (active?.type === "combatant") {
      // Combatant tile — toggle selection.
      selectedTargetId = selectedTargetId === active.id ? null : active.id;
      rebuildFocus();
      render();
    } else if (active?.type === "action") {
      void executeAction(active.kind,);
    }
  }
}

/** Order the focus cycle: combatants first (in roster order), then actions. */
function buildFocusTargets(): void {
  focusTargets = [];
  if (!battle) { return; }
  for (const c of battle.combatants) {
    if (c.hp > 0) { focusTargets.push({ type: "combatant", id: c.id, },); }
  }
  for (const a of ACTIONS) { focusTargets.push({ type: "action", kind: a.kind, },); }
  focusedIndex = Math.min(focusedIndex, Math.max(0, focusTargets.length - 1,),);
}

/** @returns true when two focus targets refer to the same element. */
function sameTarget(a: BattleFocusTarget, b: BattleFocusTarget,): boolean {
  if (a.type !== b.type) { return false; }
  if (a.type === "combatant" && b.type === "combatant") {
    return a.id === b.id;
  }
  if (a.type === "action" && b.type === "action") {
    return a.kind === b.kind;
  }
  return false;
}

/** Rebuild focus targets, preserving the current focus if still valid. */
function rebuildFocus(): void {
  const prev = focusTargets[focusedIndex];
  buildFocusTargets();
  if (!prev) { return; }
  const idx = focusTargets.findIndex((t,) => sameTarget(t, prev,));
  if (idx !== -1) { focusedIndex = idx; }
}
