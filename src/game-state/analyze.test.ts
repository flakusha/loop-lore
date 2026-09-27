// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { analyzeGameState, type GameState, } from "./analyze";

function entity(id: string, x: number, y: number,): GameState["entities"][number] {
  return { id, name: `entity-${id}`, kind: "npc", x, y, };
}

function state(entities: GameState["entities"],): GameState {
  return { grid: { width: 10, height: 10, }, entities, };
}

describe("analyzeGameState", () => {
  it("reports every entity as added on the first state", () => {
    const analysis = analyzeGameState(state([entity("b", 1, 1,), entity("a", 0, 0,),],), null,);
    expect(analysis.movements,).toEqual([],);
    expect(analysis.added,).toEqual(["a", "b",],);
    expect(analysis.removed,).toEqual([],);
  });

  it("reports movements for entities that changed position", () => {
    const before = state([entity("a", 0, 0,), entity("b", 5, 5,),],);
    const after = state([entity("a", 2, 3,), entity("b", 5, 5,),],);
    const analysis = analyzeGameState(after, before,);
    expect(analysis.movements,).toEqual([
      { entityId: "a", from: { x: 0, y: 0, }, to: { x: 2, y: 3, }, },
    ],);
    expect(analysis.added,).toEqual([],);
    expect(analysis.removed,).toEqual([],);
  });

  it("reports added and removed entities", () => {
    const before = state([entity("a", 0, 0,), entity("gone", 9, 9,),],);
    const after = state([entity("a", 0, 0,), entity("new", 4, 4,),],);
    const analysis = analyzeGameState(after, before,);
    expect(analysis.added,).toEqual(["new",],);
    expect(analysis.removed,).toEqual(["gone",],);
    expect(analysis.movements,).toEqual([],);
  });

  it("handles a mixed move/add/remove diff", () => {
    const before = state([entity("a", 0, 0,), entity("b", 1, 1,), entity("c", 2, 2,),],);
    const after = state([entity("a", 7, 7,), entity("c", 2, 2,), entity("d", 3, 3,),],);
    const analysis = analyzeGameState(after, before,);
    expect(analysis.movements,).toEqual([
      { entityId: "a", from: { x: 0, y: 0, }, to: { x: 7, y: 7, }, },
    ],);
    expect(analysis.added,).toEqual(["d",],);
    expect(analysis.removed,).toEqual(["b",],);
  });

  it("lets the last entity win on duplicate ids", () => {
    const analysis = analyzeGameState(
      state([entity("a", 0, 0,), entity("a", 5, 5,),],),
      null,
    );
    expect(analysis.added,).toEqual(["a",],);
    expect(analysis.movements,).toEqual([],);

    const movement = analyzeGameState(
      state([entity("a", 0, 0,), entity("a", 5, 5,),],),
      state([entity("a", 0, 0,), entity("a", 6, 6,),],),
    );
    expect(movement.movements,).toEqual([
      { entityId: "a", from: { x: 6, y: 6, }, to: { x: 5, y: 5, }, },
    ],);
  });

  it("produces an empty diff for empty entities", () => {
    expect(analyzeGameState(state([],), null,),).toEqual({
      movements: [],
      added: [],
      removed: [],
    },);
    const empty = state([],);
    expect(analyzeGameState(empty, empty,),).toEqual({
      movements: [],
      added: [],
      removed: [],
    },);
  });

  it("sorts movements, added and removed by entityId", () => {
    const before = state([entity("z", 0, 0,), entity("m", 1, 1,), entity("a", 2, 2,),],);
    const after = state([entity("m", 8, 8,), entity("z", 9, 9,), entity("b", 3, 3,),],);
    const analysis = analyzeGameState(after, before,);
    expect(analysis.movements.map((m,) => m.entityId),).toEqual(["m", "z",],);
    expect(analysis.added,).toEqual(["b",],);
    expect(analysis.removed,).toEqual(["a",],);
  });

  it("carries the caption through to the analysis", () => {
    const withCaption = { ...state([entity("a", 0, 0,),],), caption: "a tavern", };
    expect(analyzeGameState(withCaption, null,).caption,).toBe("a tavern",);
  });
});
