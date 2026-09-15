import { describe, expect, test, } from "bun:test";

import {
  CharacterState,
  type CharacterState as CState,
  characterStateMachine,
} from "./character-state.js";

describe("CharacterState", () => {
  test("constants are as defined", () => {
    expect(CharacterState.Active,).toBe("active",);
    expect(CharacterState.Injured,).toBe("injured",);
    expect(CharacterState.Unconscious,).toBe("unconscious",);
    expect(CharacterState.Dead,).toBe("dead",);
  });

  test("initial state is Active", () => {
    expect(characterStateMachine.def.initial,).toBe(CharacterState.Active,);
  });

  test("Dead is terminal", () => {
    expect(characterStateMachine.def.terminal,).toEqual([CharacterState.Dead,],);
  });

  test("active → injured (wound)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Active, CharacterState.Injured,),).toBe(true,);
  });

  test("active → unconscious (knocked out)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Active, CharacterState.Unconscious,),).toBe(true,);
  });

  test("injured → active (healed)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Injured, CharacterState.Active,),).toBe(true,);
  });

  test("injured → unconscious", () => {
    expect(characterStateMachine.canTransition(CharacterState.Injured, CharacterState.Unconscious,),).toBe(true,);
  });

  test("unconscious → injured (recovered partially)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Unconscious, CharacterState.Injured,),).toBe(true,);
  });

  test("unconscious → active is NOT allowed (must pass through injured)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Unconscious, CharacterState.Active,),).toBe(false,);
  });

  test("any state → dead (final death)", () => {
    expect(characterStateMachine.canTransition(CharacterState.Active, CharacterState.Dead,),).toBe(true,);
    expect(characterStateMachine.canTransition(CharacterState.Injured, CharacterState.Dead,),).toBe(true,);
    expect(characterStateMachine.canTransition(CharacterState.Unconscious, CharacterState.Dead,),).toBe(true,);
  });

  test("dead → any other state is forbidden (terminal)", () => {
    for (const target of [CharacterState.Active, CharacterState.Injured, CharacterState.Unconscious,] as CState[]) {
      expect(characterStateMachine.canTransition(CharacterState.Dead, target,),).toBe(false,);
    }
  });

  test("transition() throws when invalid", () => {
    expect(() => characterStateMachine.transition(CharacterState.Dead, CharacterState.Active,))
      .toThrow(/dead.*active/,);
  });

  test("full transition closure covers every state", () => {
    const reachable = new Set<CState>();
    for (const state of Object.values(CharacterState,) as CState[]) {
      for (const target of characterStateMachine.def.transitions[state]) {
        reachable.add(target,);
      }
    }
    expect(reachable,).toEqual(new Set(Object.values(CharacterState,) as CState[],),);
  });
});
