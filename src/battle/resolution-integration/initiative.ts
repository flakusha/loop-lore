// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  DiceRoll,
  RollModifier,
} from "../integration-schemas";
import {
  rollDice,
} from "../integration-schemas";

/** Make an initiative roll */
export function makeInitiativeRoll(
  dexterity: number,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  initiative: number;
} {
  const roll = rollDice("d20", 1, [
    { source: "initiative", value: dexterity, type: "bonus", },
    ...modifiers,
  ],);

  return {
    roll,
    initiative: roll.total,
  };
}
