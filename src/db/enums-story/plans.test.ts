// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan-item enum + state-machine tests (epic-assistant-step-planning).
 *
 * The transition table is the contract `createPlanningService.advance` relies
 * on to reject illegal moves, so it is pinned table-driven rather than
 * spot-checked: every legal edge must be reachable, and every state pair NOT
 * in the table must throw.
 */
import { describe, expect, test, } from "bun:test";
import { PlanItemKind, PlanItemState, planItemStateMachine, } from "./plans";

describe("plan item enums", () => {
  test("PlanItemKind carries the six persisted kinds", () => {
    expect(PlanItemKind,).toEqual({
      Story: "story",
      Task: "task",
      Context: "context",
      Step: "step",
      Creative: "creative",
      Draft: "draft",
    },);
  });

  test("PlanItemState carries the four persisted states", () => {
    expect(PlanItemState,).toEqual({ Todo: "todo", Doing: "doing", Done: "done", Blocked: "blocked", },);
  });
});

describe("planItemStateMachine", () => {
  test("starts at todo with no terminal states", () => {
    expect(planItemStateMachine.def.initial,).toBe("todo",);
    expect(planItemStateMachine.def.terminal,).toEqual([],);
    for (const state of Object.values(PlanItemState,)) {
      expect(planItemStateMachine.isValid(state,),).toBe(true,);
      expect(planItemStateMachine.isTerminal(state,),).toBe(false,);
    }
  });

  test("rejects a state outside the value set", () => {
    expect(planItemStateMachine.isValid("archived" as PlanItemState,),).toBe(false,);
    expect(planItemStateMachine.canTransition("todo", "archived" as never,),).toBe(false,);
  });

  const edge = (from: PlanItemState, to: PlanItemState,): string => `${from}→${to}`;

  // Every edge the table declares must be allowed and must return the target.
  const LEGAL: Array<[PlanItemState, PlanItemState,]> = [
    [PlanItemState.Todo, PlanItemState.Doing,],
    [PlanItemState.Todo, PlanItemState.Blocked,],
    [PlanItemState.Todo, PlanItemState.Done,],
    [PlanItemState.Doing, PlanItemState.Done,],
    [PlanItemState.Doing, PlanItemState.Blocked,],
    [PlanItemState.Doing, PlanItemState.Todo,],
    [PlanItemState.Done, PlanItemState.Todo,],
    [PlanItemState.Blocked, PlanItemState.Todo,],
    [PlanItemState.Blocked, PlanItemState.Doing,],
  ];

  test.each(LEGAL,)("allows %s → %s", (from, to,) => {
    expect(planItemStateMachine.canTransition(from, to,),).toBe(true,);
    expect(planItemStateMachine.transition(from, to,),).toBe(to,);
  },);

  test("the legal set is exactly the transition table (no undeclared edge exists)", () => {
    const table = planItemStateMachine.def.transitions;
    const declared = Object.values(PlanItemState,).flatMap((from,) =>
      (table[from] ?? []).map((to,) => edge(from, to,))
    );

    expect([...declared,].sort(),).toEqual(LEGAL.map((pair,) => edge(pair[0], pair[1],)).sort(),);
  });

  // Everything the table omits — plus every self-loop — must throw.
  const ILLEGAL: Array<[PlanItemState, PlanItemState,]> = Object.values(PlanItemState,).flatMap((from,) =>
    Object.values(PlanItemState,)
      .filter((to,) => !planItemStateMachine.canTransition(from, to,))
      .map((to,) => [from, to,] as [PlanItemState, PlanItemState,])
  );

  test.each(ILLEGAL,)("rejects %s → %s", (from, to,) => {
    expect(planItemStateMachine.canTransition(from, to,),).toBe(false,);
    expect(() => planItemStateMachine.transition(from, to,)).toThrow(
      `Invalid state transition: ${from} → ${to}`,
    );
  },);

  test("the illegal set is non-empty (the table is not vacuous)", () => {
    expect(ILLEGAL.length,).toBeGreaterThan(0,);
    expect(ILLEGAL.length + LEGAL.length,).toBe(Object.values(PlanItemState,).length ** 2,);
  });

  test("done is not absorbing — it reopens to todo", () => {
    expect(planItemStateMachine.canTransition(PlanItemState.Done, PlanItemState.Done,),).toBe(false,);
    expect(planItemStateMachine.canTransition(PlanItemState.Done, PlanItemState.Doing,),).toBe(false,);
    expect(planItemStateMachine.canTransition(PlanItemState.Done, PlanItemState.Blocked,),).toBe(false,);
    expect(planItemStateMachine.transition(PlanItemState.Done, PlanItemState.Todo,),).toBe("todo",);
  });
});
