// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — pure types + command mapping.
 *
 * `battleCommandFor` is the panel's observable contract: maps a UI action
 * (attack/heal/end) + a selected target onto a slash command the chat path
 * executes. Pure + unit-tested in panel.test.ts.
 */

/** */
export interface BattleCombatantView {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  initiative: number;
}

/** */
export interface BattleView {
  id: string;
  status: string;
  round: number;
  turnIndex: number;
  combatants: BattleCombatantView[];
}

/** */
export type BattleActionKind = "attack" | "heal" | "end";

/** A focusable element in the keyboard cycle: a combatant or an action. */
export type BattleFocusTarget =
  | { type: "combatant"; id: string }
  | { type: "action"; kind: BattleActionKind };

export const ACTIONS: { kind: BattleActionKind; label: string }[] = [
  { kind: "attack", label: "Attack", },
  { kind: "heal", label: "Heal", },
  { kind: "end", label: "End battle", },
];

/**
 * @param kind
 * @param targetId
 * @param combatants
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

/**
 * Clamp an HP fraction to a 0–100 percentage for the progress bar.
 * @param hp
 * @param maxHp
 */
export function hpPercent(hp: number, maxHp: number,): number {
  const raw = (hp / Math.max(1, maxHp,)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw,),),);
}

/**
 * @param name
 */
export function quote(name: string,): string {
  return name.includes(" ",) ? `"${name}"` : name;
}

/**
 * @param value
 */
export function escapeHtml(value: string,): string {
  return value
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}
