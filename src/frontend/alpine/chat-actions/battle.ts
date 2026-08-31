// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Battle command-action dispatch.
 *
 * The `battle-*` command actions render/update/clear the VN-style battle
 * panel from response payloads. Kept apart from `dispatch.ts` (the general
 * chat-action router) so each file stays under 250L.
 */

import type { BattleCombatantView, BattleView, } from "../../battle/panel";

/** */
export type ActionHandler = (
  ctx: unknown,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

/**
 * Render the battle panel from a `battle-*` command action payload.
 * @param ctx
 * @param payload
 */
function renderBattleFromPayload(
  ctx: unknown,
  payload: Record<string, unknown> | null,
): void {
  const raw = payload?.battle;
  if (!isBattleViewShape(raw,)) { return; }
  const combatants: BattleCombatantView[] = [];
  for (const c of raw.combatants) {
    if (!isCombatantShape(c,)) { continue; }
    combatants.push({
      id: c.id,
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      initiative: c.initiative,
    },);
  }
  const view: BattleView = {
    id: raw.id,
    status: raw.status,
    round: raw.round,
    turnIndex: raw.turnIndex,
    combatants,
  };
  const panel = ctx as { renderBattlePanel(view: BattleView,): void } | null;
  panel?.renderBattlePanel(view,);
}

/**
 * @param value
 * @returns true when `value` has the shape of a battle view payload.
 */
function isBattleViewShape(value: unknown,): value is {
  id: string;
  status: "active" | "completed" | "abandoned";
  round: number;
  turnIndex: number;
  combatants: unknown[];
} {
  if (!value || typeof value !== "object") { return false; }
  const v = value as Record<string, unknown>;
  const validStatus = ["active", "completed", "abandoned",].includes(String(v.status,),);
  return (
    typeof v.id === "string" &&
    validStatus &&
    typeof v.round === "number" &&
    typeof v.turnIndex === "number" &&
    Array.isArray(v.combatants,)
  );
}

/**
 * @param value
 * @returns true when `value` has a combatant view shape.
 */
function isCombatantShape(value: unknown,): value is BattleCombatantView {
  if (!value || typeof value !== "object") { return false; }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.hp === "number" &&
    typeof v.maxHp === "number" &&
    typeof v.initiative === "number"
  );
}

export const battleActionHandlers: Record<string, ActionHandler> = {
  "battle-started": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-updated": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-status": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-ended": (ctx,) => {
    (ctx as { renderBattlePanel(view: unknown,): void }).renderBattlePanel(null,);
  },
};
