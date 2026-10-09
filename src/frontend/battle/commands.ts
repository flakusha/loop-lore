// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — pure types + command mapping.
 *
 * `battleCommandFor` is the panel's observable contract: maps a UI action
 * (attack/heal/end, item menu toggle, social-* verbs) + a selected target
 * onto a slash command the chat path executes. `battleItemCommandFor` does
 * the same for Item-group rows. Pure + unit-tested in panel.test.ts.
 */

/** */
export interface BattleCombatantView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  initiative: number;
}

/** A battle-usable item offered by the panel's Item group. */
export interface BattleItemView {
  /** `actor_items` row id. */
  id: string;
  /** Item name (quoted into the `/battle use` command). */
  name: string;
  /** Stacked units remaining. */
  quantity: number;
}

/** */
export interface BattleView {
  id: string;
  status: string;
  round: number;
  turnIndex: number;
  combatants: BattleCombatantView[];
  /** The acting combatant's battle-usable items (empty when none). */
  items: BattleItemView[];
}

/** */
export type BattleActionKind =
  | "attack"
  | "heal"
  | "end"
  | "item"
  | "social-intimidate"
  | "social-taunt"
  | "social-negotiate"
  | "social-surrender";

/** The social verbs the panel surfaces (one `/battle social` verb each). */
export type SocialVerb = "intimidate" | "taunt" | "negotiate" | "surrender";

/** A focusable element in the keyboard cycle: a combatant, an action, or an item row. */
export type BattleFocusTarget =
  | { type: "combatant"; id: string }
  | { type: "action"; kind: BattleActionKind }
  | { type: "item"; id: string };

export const ACTIONS: { kind: BattleActionKind; label: string }[] = [
  { kind: "attack", label: "Attack", },
  { kind: "heal", label: "Heal", },
  { kind: "end", label: "End battle", },
];

/** Social action buttons, in panel order. */
export const SOCIAL_ACTIONS: { kind: BattleActionKind; verb: SocialVerb; label: string }[] = [
  { kind: "social-intimidate", verb: "intimidate", label: "Intimidate", },
  { kind: "social-taunt", verb: "taunt", label: "Taunt", },
  { kind: "social-negotiate", verb: "negotiate", label: "Negotiate", },
  { kind: "social-surrender", verb: "surrender", label: "Surrender", },
];

/** Inputs the action-availability rule needs. */
export interface ActionAvailabilityState {
  /** The battle is in its active phase. */
  battleActive: boolean;
  /** A combatant is selected as the target. */
  hasTarget: boolean;
  /** Usable items available to the acting combatant. */
  itemCount: number;
}

/**
 * Whether an action button should be enabled.
 *
 * Every action except `end` (the panel's escape hatch) requires an active
 * battle; targeted actions additionally require a selected target; the Item
 * button requires at least one usable item.
 * @param kind - The action kind
 * @param state - Availability inputs
 * @returns true when the button should be enabled
 */
export function actionAvailable(
  kind: BattleActionKind,
  state: ActionAvailabilityState,
): boolean {
  if (kind === "end") { return true; }
  if (!state.battleActive) { return false; }
  if (kind === "item") { return state.itemCount > 0; }
  return state.hasTarget;
}

/**
 * @param kind
 * @param targetId
 * @param combatants
 * @returns {string | null}
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

    case "social-intimidate":
    case "social-taunt":
    case "social-negotiate":
    case "social-surrender": {
      const social = SOCIAL_ACTIONS.find((a,) => a.kind === kind);
      return social && target ? `/battle social ${social.verb} ${quote(target.name,)}` : null;
    }

    // The Item button toggles the item menu; item rows dispatch instead.
    case "item": {
      return null;
    }
  }
}

/**
 * Build the `/battle use` command for an item row.
 * @param item - The item to use
 * @param targetId - Selected target (omitted = the acting combatant itself)
 * @param combatants - The roster, for target resolution
 * @returns {string | null}
 */
export function battleItemCommandFor(
  item: BattleItemView,
  targetId: string | null,
  combatants: BattleCombatantView[],
): string | null {
  const target = targetId ? combatants.find((c,) => c.id === targetId) : null;
  return target
    ? `/battle use ${quote(item.name,)} ${quote(target.name,)}`
    : `/battle use ${quote(item.name,)}`;
}

/**
 * Clamp an HP fraction to a 0–100 percentage for the progress bar.
 * @param hp
 * @param maxHp
 * @returns {number}
 */
export function hpPercent(hp: number, maxHp: number,): number {
  const raw = (hp / Math.max(1, maxHp,)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw,),),);
}

/**
 * @param name
 * @returns {string}
 */
export function quote(name: string,): string {
  return name.includes(" ",) ? `"${name}"` : name;
}

/**
 * @param value
 * @returns {string}
 */
export function escapeHtml(value: string,): string {
  return value
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}
