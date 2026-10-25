// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/story/quest-engine/progress-milestone.test.ts — a quest progress gain
// surfaces the narrative milestone it crossed, and only that one.
import { describe, expect, test, } from "bun:test";
import { computeMilestoneText, type MilestoneHook, } from "./progress-milestone";

const HOOKS: MilestoneHook[] = [
  { progress: 25, narrative: "A quarter of the way there", },
  { progress: 50, narrative: "Halfway there", },
  { progress: 100, narrative: "All the way", },
];

describe("computeMilestoneText", () => {
  test("a gain that crosses a hook surfaces that hook's narrative", () => {
    expect(computeMilestoneText(HOOKS, 20, 30,),).toBe("A quarter of the way there",);
  });

  test("the highest crossed hook wins", () => {
    expect(computeMilestoneText(HOOKS, 0, 100,),).toBe("All the way",);
  });

  test("a gain inside an already-reached band surfaces nothing", () => {
    expect(computeMilestoneText(HOOKS, 30, 40,),).toBeNull();
  });

  test("a gain that reaches a hook exactly surfaces it", () => {
    expect(computeMilestoneText(HOOKS, 49, 50,),).toBe("Halfway there",);
  });

  test("a quest without hooks surfaces nothing", () => {
    expect(computeMilestoneText([], 0, 100,),).toBeNull();
  });
});
