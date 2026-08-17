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
 */

export interface BattleCombatantView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  initiative: number;
}

export interface BattleView {
  id: string;
  status: string;
  round: number;
  turnIndex: number;
  combatants: BattleCombatantView[];
}

export type BattleActionKind = "attack" | "heal" | "end";

/** A focusable element in the keyboard cycle: a combatant or an action. */
type BattleFocusTarget =
  | { type: "combatant"; id: string }
  | { type: "action"; kind: BattleActionKind };

/** Bridge the battle panel to the host chat component. */
export interface BattlePanelContext {
  /** Send a slash command through the chat's message path. */
  sendCommand: (command: string,) => Promise<void>;
}

const ACTIONS: { kind: BattleActionKind; label: string }[] = [
  { kind: "attack", label: "Attack", },
  { kind: "heal", label: "Heal", },
  { kind: "end", label: "End battle", },
];

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
 * @param view - The battle state serialized by a `battle-*` command action
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

  overlay.append(renderHeader(), renderRoster(), renderActions(),);

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

function renderHeader(): HTMLElement {
  const h = document.createElement("div",);
  h.className = "battle-panel-header";
  h.innerHTML = `<strong>Round ${battle!.round}</strong> <span class="battle-panel-status">${
    escapeHtml(battle!.status,)
  }</span>`;
  return h;
}

function renderRoster(): HTMLElement {
  const list = document.createElement("div",);
  list.className = "battle-roster";
  list.setAttribute("role", "list",);

  let i = 0;
  for (const c of battle!.combatants) {
    const acting = i === battle!.turnIndex;
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
      selectedTargetId = selectedTargetId === c.id ? null : c.id;
      rebuildFocus();
      render();
    },);

    list.append(tile,);
    i++;
  }
  return list;
}

function renderActions(): HTMLElement {
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
      void executeAction(action.kind,);
    },);

    bar.append(btn,);
  }
  return bar;
}

// ── Action execution ───────────────────────────────────

/**
 * Build the slash command for a battle action against a selected target.
 *
 * Pure + exported for unit testing: this is the panel's observable contract
 * (a click or keyboard trigger maps to one slash command).
 *
 * @param kind - The battle action being executed
 * @param targetId - The currently selected target combatant id, if any
 * @param combatants - The battle roster (to resolve the target's name)
 * @returns The slash command to dispatch, or null when the action has no target
 */
export function battleCommandFor(
  kind: BattleActionKind,
  targetId: string | null,
  combatants: BattleCombatantView[],
): string | null {
  const target = targetId ? combatants.find((c,) => c.id === targetId) : null;
  switch (kind) {
    case "attack": {
      return target ? `/attack ${quote(target.name,)}` : null;
    }
    case "heal": {
      return target ? `/heal ${quote(target.name,)}` : null;
    }
    case "end": {
      return "/battle end";
    }
  }
}

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

// ── Utils ──────────────────────────────────────────────

/** Clamp an HP fraction to a 0–100 percentage for the progress bar. */
function hpPercent(hp: number, maxHp: number,): number {
  const raw = (hp / Math.max(1, maxHp,)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw,),),);
}

function quote(name: string,): string {
  return name.includes(" ",) ? `"${name}"` : name;
}

function escapeHtml(value: string,): string {
  return value
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}
