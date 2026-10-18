// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for templates/composite.ts — the VnCompositeStep executor and its
 * eval-free condition subset. Delays are exercised through an injectable
 * `wait` so timing assertions are deterministic (no real timers).
 */
import { describe, expect, test, } from "bun:test";
import { compositeStepsOf, evaluateCondition, executeCompositeSteps, } from "./composite";
import type { VnCompositeStep, VnTemplate, } from "./template-engine";

function compositeTemplate(steps: VnCompositeStep[],): VnTemplate {
  return {
    id: "combo",
    name: "Combo",
    description: "",
    worldId: "w1",
    category: "composite",
    version: 1,
    variables: [],
    body: { layout: "inherit", transition: "inherit", steps, },
    tags: [],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
  };
}

describe("compositeStepsOf", () => {
  test("returns steps for a composite template carrying them", () => {
    const steps = [{ templateId: "combat_start", },];
    expect(compositeStepsOf(compositeTemplate(steps,),),).toBe(steps,);
  });

  test("returns null for composites without steps", () => {
    const template = compositeTemplate([],);
    template.body.steps = undefined;
    expect(compositeStepsOf(template,),).toBeNull();
    expect(compositeStepsOf(compositeTemplate([],),),).toBeNull();
  });

  test("returns null for non-composite templates and absent input", () => {
    const sceneTemplate = compositeTemplate([{ templateId: "x", },],);
    sceneTemplate.category = "scene";
    expect(compositeStepsOf(sceneTemplate,),).toBeNull();
    expect(compositeStepsOf(null,),).toBeNull();
    expect(compositeStepsOf(undefined,),).toBeNull();
  });
});

describe("evaluateCondition", () => {
  const context = { mood: "tense", health: 42, armed: true, name: "Mira", };

  test("empty and undefined conditions are true (no gate)", () => {
    expect(evaluateCondition(undefined, context,),).toBe(true,);
    expect(evaluateCondition("   ", context,),).toBe(true,);
  });

  test("string equality and inequality against variables", () => {
    expect(evaluateCondition("mood == 'tense'", context,),).toBe(true,);
    expect(evaluateCondition('mood == "calm"', context,),).toBe(false,);
    expect(evaluateCondition("mood != 'calm'", context,),).toBe(true,);
  });

  test("numeric ordering against variables and literals", () => {
    expect(evaluateCondition("health < 50", context,),).toBe(true,);
    expect(evaluateCondition("health <= 42", context,),).toBe(true,);
    expect(evaluateCondition("health > 42", context,),).toBe(false,);
    expect(evaluateCondition("health >= 43", context,),).toBe(false,);
    expect(evaluateCondition("-5 < health", context,),).toBe(true,);
  });

  test("boolean variables stand alone and compare", () => {
    expect(evaluateCondition("armed", context,),).toBe(true,);
    expect(evaluateCondition("armed == true", context,),).toBe(true,);
    expect(evaluateCondition("armed == false", context,),).toBe(false,);
  });

  test("&&, ||, and parentheses compose", () => {
    expect(evaluateCondition("mood == 'tense' && health < 50", context,),).toBe(true,);
    expect(evaluateCondition("mood == 'calm' || armed", context,),).toBe(true,);
    expect(evaluateCondition("(mood == 'calm' || mood == 'tense') && health > 100", context,),).toBe(false,);
  });

  test("unresolved or mistyped comparisons fail closed to false", () => {
    expect(evaluateCondition("missing_var == 'x'", context,),).toBe(false,);
    expect(evaluateCondition("missing_var", context,),).toBe(false,);
    expect(evaluateCondition("name", context,),).toBe(false,);
    expect(evaluateCondition("health == '42'", context,),).toBe(false,);
    expect(evaluateCondition("armed < true", context,),).toBe(false,);
  });

  test("unparseable input never throws and evaluates false", () => {
    expect(evaluateCondition("mood ==", context,),).toBe(false,);
    expect(evaluateCondition("== 'tense'", context,),).toBe(false,);
    expect(evaluateCondition("mood == 'unterminated", context,),).toBe(false,);
    expect(evaluateCondition("health; drop table", context,),).toBe(false,);
    expect(evaluateCondition("mood == 'tense' &&", context,),).toBe(false,);
    expect(evaluateCondition("(armed", context,),).toBe(false,);
  });
});

describe("executeCompositeSteps", () => {
  test("applies steps in order and honours each delay before the next step", async () => {
    const waits: number[] = [];
    const applied: string[] = [];
    const result = await executeCompositeSteps({
      steps: [
        { templateId: "flashback", delay: 2_000, },
        { templateId: "combat_start", },
        { templateId: "dialogue_tense", delay: 0, },
      ],
      context: {},
      apply: (step,) => {
        applied.push(step.templateId,);
        return true;
      },
      wait: async (ms,) => {
        waits.push(ms,);
      },
    },);

    expect(applied,).toEqual(["flashback", "combat_start", "dialogue_tense",],);
    // delay sits on the step BEFORE the pause: flashback's 2000ms gates
    // combat_start; dialogue_tense's 0 is not waited.
    expect(waits,).toEqual([2_000,],);
    expect(result,).toEqual({ applied: 3, skipped: [], },);
  });

  test("skips steps whose condition is false and records them", async () => {
    const applied: string[] = [];
    const result = await executeCompositeSteps({
      steps: [
        { templateId: "flashback", condition: "mood == 'calm'", },
        { templateId: "combat_start", condition: "mood == 'tense'", },
      ],
      context: { mood: "tense", },
      apply: (step,) => {
        applied.push(step.templateId,);
        return true;
      },
      wait: async () => {},
    },);

    expect(applied,).toEqual(["combat_start",],);
    expect(result.applied,).toBe(1,);
    expect(result.skipped,).toEqual([{ index: 0, templateId: "flashback", reason: "condition", },],);
  });

  test("records unknown template ids without aborting the sequence", async () => {
    const applied: string[] = [];
    const result = await executeCompositeSteps({
      steps: [
        { templateId: "missing", },
        { templateId: "combat_start", },
      ],
      context: {},
      apply: (step,) => {
        if (step.templateId === "missing") { return false; }
        applied.push(step.templateId,);
        return true;
      },
      wait: async () => {},
    },);

    expect(applied,).toEqual(["combat_start",],);
    expect(result.skipped,).toEqual([{ index: 0, templateId: "missing", reason: "unknown-template", },],);
  });

  test("a skipped step's delay is not waited", async () => {
    const waits: number[] = [];
    await executeCompositeSteps({
      steps: [{ templateId: "flashback", delay: 5_000, condition: "mood == 'calm'", },],
      context: { mood: "tense", },
      apply: () => true,
      wait: async (ms,) => {
        waits.push(ms,);
      },
    },);

    expect(waits,).toEqual([],);
  });

  test("non-finite and negative delays are ignored", async () => {
    const waits: number[] = [];
    await executeCompositeSteps({
      steps: [
        { templateId: "a", delay: Number.NaN, },
        { templateId: "b", delay: -100, },
      ],
      context: {},
      apply: () => true,
      wait: async (ms,) => {
        waits.push(ms,);
      },
    },);

    expect(waits,).toEqual([],);
  });
});
