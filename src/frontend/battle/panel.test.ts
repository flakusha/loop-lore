// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Panel — command mapping tests.
 *
 * `battleCommandFor` is the panel's observable contract: a click or keyboard
 * trigger on a battle element resolves to exactly one slash command. This
 * covers that mapping (target resolution, name quoting, no-target cases)
 * without needing a browser DOM.
 */
import { describe, expect, it, } from "bun:test";
import { type BattleCombatantView, battleCommandFor, } from "./panel";

const roster: BattleCombatantView[] = [
  { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
  { id: "orc", name: "Orc Grunt", hp: 8, maxHp: 20, initiative: 5, },
];

describe("battleCommandFor", () => {
  it("attack quotes a target name that contains spaces", () => {
    expect(battleCommandFor("attack", "orc", roster,),).toBe(`/attack "Orc Grunt"`,);
  });

  it("attack does not quote a single-word target name", () => {
    const singleWord = [{ id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },];
    expect(battleCommandFor("attack", "alice", singleWord,),).toBe("/attack Alice",);
  });

  it("attack returns null without a selected target", () => {
    expect(battleCommandFor("attack", null, roster,),).toBeNull();
  });

  it("heal maps to /heal with the target name", () => {
    expect(battleCommandFor("heal", "alice", roster,),).toBe("/heal Alice",);
  });

  it("heal returns null without a selected target", () => {
    expect(battleCommandFor("heal", null, roster,),).toBeNull();
  });

  it("end always maps to /battle end regardless of target", () => {
    expect(battleCommandFor("end", "alice", roster,),).toBe("/battle end",);
    expect(battleCommandFor("end", null, roster,),).toBe("/battle end",);
  });

  it("ignores a target id that is not in the roster", () => {
    expect(battleCommandFor("attack", "ghost", roster,),).toBeNull();
  });
});
