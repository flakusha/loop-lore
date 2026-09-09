// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { getSceneTemplate, } from "./scene-templates/scene-registry";
import {
  clearTriggerHistory,
  evaluateTriggers,
  getTriggerHistory,
  recordTrigger,
  TRANSITION_TRIGGERS,
  type VnTriggerContext,
} from "./transition-triggers";

function baseContext(overrides: Partial<VnTriggerContext> = {},): VnTriggerContext {
  return {
    combatActive: false,
    charactersInScene: [],
    previousCharacters: [],
    choiceSelected: false,
    sceneEnding: false,
    ...overrides,
  };
}

describe("TRANSITION_TRIGGERS", () => {
  test("trigger ids are unique and priorities are positive", () => {
    const ids = TRANSITION_TRIGGERS.map((t,) => t.id);
    expect(new Set(ids,).size,).toBe(ids.length,);
    for (const trigger of TRANSITION_TRIGGERS) {
      expect(trigger.priority,).toBeGreaterThan(0,);
    }
  });

  test("every trigger points at an existing built-in scene template", () => {
    for (const trigger of TRANSITION_TRIGGERS) {
      expect(getSceneTemplate(trigger.templateId,),).not.toBeUndefined();
    }
  });
});

describe("evaluateTriggers", () => {
  test("returns null when no condition matches", () => {
    expect(evaluateTriggers(baseContext(),),).toBeNull();
  });

  test("location change fires the introduction template", () => {
    const template = evaluateTriggers(baseContext({
      currentLocationId: "tavern",
      previousLocationId: "forest",
    },),);
    expect(template?.id,).toBe("introduction",);
  });

  test("same location does not fire", () => {
    const template = evaluateTriggers(baseContext({
      currentLocationId: "tavern",
      previousLocationId: "tavern",
    },),);
    expect(template,).toBeNull();
  });

  test("location change without a previous location does not fire", () => {
    const template = evaluateTriggers(baseContext({ currentLocationId: "tavern", },),);
    expect(template,).toBeNull();
  });

  test("combat start fires the combat template", () => {
    expect(evaluateTriggers(baseContext({ combatActive: true, },),)?.id,).toBe("combat_start",);
  });

  test("a newly entering character fires the introduction template", () => {
    const template = evaluateTriggers(baseContext({
      charactersInScene: ["aria",],
      previousCharacters: ["bob",],
    },),);
    expect(template?.id,).toBe("introduction",);
  });

  test("unchanged cast does not fire the character-enter trigger", () => {
    const template = evaluateTriggers(baseContext({
      charactersInScene: ["aria",],
      previousCharacters: ["aria",],
    },),);
    expect(template,).toBeNull();
  });

  test("emotion shift beyond 0.5 fires confrontation, including negative shifts", () => {
    const up = evaluateTriggers(baseContext({ emotionChange: 0.6, },),);
    expect(up?.id,).toBe("confrontation",);
    const down = evaluateTriggers(baseContext({ emotionChange: -0.9, },),);
    expect(down?.id,).toBe("confrontation",);
  });

  test("emotion shift of exactly 0.5 does not fire", () => {
    expect(evaluateTriggers(baseContext({ emotionChange: 0.5, },),),).toBeNull();
  });

  test("zero emotion change does not fire", () => {
    expect(evaluateTriggers(baseContext({ emotionChange: 0, },),),).toBeNull();
  });

  test("choice selection fires resolution", () => {
    expect(evaluateTriggers(baseContext({ choiceSelected: true, },),)?.id,).toBe("resolution",);
  });

  test("scene end fires farewell", () => {
    expect(evaluateTriggers(baseContext({ sceneEnding: true, },),)?.id,).toBe("farewell",);
  });

  test("highest-priority match wins when several conditions hold", () => {
    const template = evaluateTriggers(baseContext({
      sceneEnding: true,
      choiceSelected: true,
      combatActive: true,
    },),);
    expect(template?.id,).toBe("farewell",);
  });

  test("combat (20) outranks character enter (15) when both match", () => {
    const template = evaluateTriggers(baseContext({
      combatActive: true,
      charactersInScene: ["new",],
      previousCharacters: [],
    },),);
    expect(template?.id,).toBe("combat_start",);
  });
});

describe("trigger history", () => {
  beforeEach(() => {
    clearTriggerHistory();
  },);

  test("recordTrigger appends events with trigger and template ids", () => {
    recordTrigger("on_scene_end", "farewell",);
    recordTrigger("on_combat_start", "combat_start",);
    const history = getTriggerHistory();
    expect(history.map((e,) => e.triggerId),).toEqual(["on_scene_end", "on_combat_start",],);
    expect(history[0]?.templateId,).toBe("farewell",);
    expect(Number.isNaN(Date.parse(history[0]?.timestamp ?? "x",),),).toBe(false,);
  });

  test("getTriggerHistory returns a copy — mutating it does not affect the log", () => {
    recordTrigger("t1", "farewell",);
    getTriggerHistory().push({ triggerId: "forged", timestamp: "", templateId: "", },);
    expect(getTriggerHistory().length,).toBe(1,);
  });

  test("history is capped at 50 events, oldest dropped first", () => {
    for (let i = 0; i < 55; i++) {
      recordTrigger(`t${i}`, "farewell",);
    }
    const history = getTriggerHistory();
    expect(history.length,).toBe(50,);
    expect(history[0]?.triggerId,).toBe("t5",);
    expect(history.at(-1,)?.triggerId,).toBe("t54",);
  });

  test("clearTriggerHistory empties the log", () => {
    recordTrigger("t1", "farewell",);
    clearTriggerHistory();
    expect(getTriggerHistory(),).toEqual([],);
  });
});
