// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/chat/mode-switch.test.ts — InteractionMode routing + transitions.
 *
 * Asserts every transition the table actually defines (so an edit to the
 * table breaks a test rather than silently widening the contract) and proves
 * at least one ILLEGAL transition throws.
 */
import { describe, expect, test, } from "bun:test";
import {
  allowedTransitions,
  assertValidTransition,
  INTERACTION_MODES,
  InteractionMode,
  ModeTransitionError,
  OrchestrationTarget,
  routeInteractionMode,
} from "./mode-switch";

describe("routeInteractionMode", () => {
  test("normal dispatches to the chat pipeline", () => {
    expect(routeInteractionMode({ mode: InteractionMode.Normal, },),).toBe(OrchestrationTarget.Chat,);
  });

  test("question dispatches to the question pipeline", () => {
    expect(routeInteractionMode({ mode: InteractionMode.Question, },),).toBe(
      OrchestrationTarget.Question,
    );
  });

  test("inventory dispatches to the inventory pipeline", () => {
    expect(routeInteractionMode({ mode: InteractionMode.Inventory, },),).toBe(
      OrchestrationTarget.Inventory,
    );
  });

  test("battle dispatches to combat only while an encounter is live", () => {
    expect(routeInteractionMode({ mode: InteractionMode.Battle, context: { inCombat: true, }, },),).toBe(
      OrchestrationTarget.Combat,
    );

    expect(routeInteractionMode({ mode: InteractionMode.Battle, context: { inCombat: false, }, },),).toBe(
      OrchestrationTarget.Chat,
    );

    expect(routeInteractionMode({ mode: InteractionMode.Battle, },),).toBe(OrchestrationTarget.Chat,);
  });

  test("every mode in the enum routes somewhere", () => {
    for (const mode of INTERACTION_MODES) {
      expect(
        Object.values(OrchestrationTarget,).includes(
          routeInteractionMode({ mode, context: { inCombat: true, }, },),
        ),
      ).toBe(true,);
    }
  });
});

describe("assertValidTransition", () => {
  test("normal may enter any side mode", () => {
    for (const to of [InteractionMode.Battle, InteractionMode.Question, InteractionMode.Inventory,]) {
      expect(assertValidTransition({ from: InteractionMode.Normal, to, },),).toBe(to,);
    }
  });

  test("every side mode may fall back to normal", () => {
    for (const from of [InteractionMode.Battle, InteractionMode.Question, InteractionMode.Inventory,]) {
      expect(assertValidTransition({ from, to: InteractionMode.Normal, },),).toBe(InteractionMode.Normal,);
    }
  });

  test("a mode may transition to itself", () => {
    expect(assertValidTransition({ from: InteractionMode.Normal, to: InteractionMode.Normal, },),).toBe(
      InteractionMode.Normal,
    );

    expect(
      assertValidTransition({ from: InteractionMode.Battle, to: InteractionMode.Battle, },),
    ).toBe(InteractionMode.Battle,);
  });

  test("ILLEGAL: question -> inventory throws", () => {
    expect(() => assertValidTransition({ from: InteractionMode.Question, to: InteractionMode.Inventory, },)).toThrow(
      ModeTransitionError,
    );
  });

  test("ILLEGAL: inventory -> battle throws", () => {
    expect(() => assertValidTransition({ from: InteractionMode.Inventory, to: InteractionMode.Battle, },)).toThrow(
      ModeTransitionError,
    );
  });

  test("ILLEGAL: battle -> question throws", () => {
    expect(() => assertValidTransition({ from: InteractionMode.Battle, to: InteractionMode.Question, },)).toThrow(
      ModeTransitionError,
    );
  });

  test("the thrown error carries both ends of the illegal move", () => {
    try {
      assertValidTransition({ from: InteractionMode.Question, to: InteractionMode.Battle, },);
      throw new Error("expected the transition to be refused",);
    } catch (error) {
      expect(error,).toBeInstanceOf(ModeTransitionError,);
      const typed = error as ModeTransitionError;
      expect(typed.from,).toBe(InteractionMode.Question,);
      expect(typed.to,).toBe(InteractionMode.Battle,);
    }
  });
});

describe("allowedTransitions", () => {
  test("matches the table for every mode", () => {
    expect(allowedTransitions(InteractionMode.Normal,).sort(),).toEqual(
      [InteractionMode.Battle, InteractionMode.Inventory, InteractionMode.Question,].sort(),
    );

    for (const mode of [InteractionMode.Battle, InteractionMode.Question, InteractionMode.Inventory,]) {
      expect(allowedTransitions(mode,),).toEqual([InteractionMode.Normal,],);
    }
  });
});
