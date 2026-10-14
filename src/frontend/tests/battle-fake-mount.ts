// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle-panel mount harness for tests.
 *
 * Mount/fixture helpers split from `battle-fake-dom.ts` to keep it under
 * the file-size guard. Behavior identical.
 */

import {
  type BattleCombatantView,
  type BattleView,
  mountBattlePanel,
  renderBattle,
} from "../battle/panel";
import { type FakeEl, makeEl, query, } from "./battle-fake-dom";

// ── Battle-panel mounting helpers ────────────────────────────

/**
 * Standard two-combatant battle view, overridable per test.
 * @param overrides
 * @returns a battle view object with two default combatants.
 */
export function view(overrides: Partial<BattleView> = {},): BattleView {
  return {
    id: "b1",
    status: "active",
    round: 2,
    turnIndex: 0,
    combatants: [
      { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
      { id: "orc", name: "Orc Grunt", hp: 8, maxHp: 20, initiative: 5, },
    ],
    items: [],
    ...overrides,
  };
}

export interface Mounted {
  container: FakeEl;
  /** Slash commands handed to sendCommand, in order. */
  sent: string[];
}

/**
 * Mount the panel on a fresh container and optionally render a battle.
 * @param active
 * @returns a mounted panel with container and sent command list.
 */
export function mountBattle(active: BattleView | null,): Mounted {
  const container = makeEl("div",);
  const sent: string[] = [];
  mountBattlePanel(container as unknown as HTMLElement, {
    sendCommand: (command,) => {
      sent.push(command,);
      return Promise.resolve();
    },
  },);

  if (active) { renderBattle(active,); }
  return { container, sent, };
}

/**
 * Find a combatant tile by its data-battle-id.
 * @param container
 * @param id
 * @throws {Error} when no tile matches the id.
 * @returns the matching tile element.
 */
export function tile(container: FakeEl, id: string,): FakeEl {
  const el = query(container, `[data-battle-id="${id}"]`,);
  if (!el) { throw new Error(`missing combatant tile: ${id}`,); }
  return el;
}

/**
 * Find an action button by its data-battle-action kind.
 * @param container
 * @param kind
 * @throws {Error} when no button matches the kind.
 * @returns the matching button element.
 */
export function actionButton(container: FakeEl, kind: string,): FakeEl {
  const el = query(container, `[data-battle-action="${kind}"]`,);
  if (!el) { throw new Error(`missing action button: ${kind}`,); }
  return el;
}

/**
 * Dead extra combatant for roster-state fixtures.
 * @param id
 * @returns a BattleCombatantView with 0 hp.
 */
export function deadCombatant(id = "ghost",): BattleCombatantView {
  return { id, name: "Ghost", hp: 0, maxHp: 10, initiative: 1, };
}
