// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for assistant → workflow → GM handoff routing.

import { describe, expect, test, } from "bun:test";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import {
  findWorkflowById,
  matchWorkflowIntent,
  matchWorkflowTrigger,
  routeAssistantMessage,
  withShadowSteering,
} from "./workflow-routing";

function makeWorkflow(id: string, triggers: string[] = [],): AssistantWorkflowConfig {
  return {
    id,
    name: id,
    triggers,
    steps: [],
    dispatch: { backend: "b", target: "t", payloadTemplate: {}, },
  };
}

const VIDEO = makeWorkflow("video-minimax-h3", ["minimax video", "h3 video",],);
const ENTITY = makeWorkflow("entity-character", ["create a character",],);

describe("findWorkflowById", () => {
  test("resolves by id and returns undefined for unknown ids", () => {
    expect(findWorkflowById([VIDEO, ENTITY,], "entity-character",),).toBe(ENTITY,);
    expect(findWorkflowById([VIDEO, ENTITY,], "nope",),).toBeUndefined();
  });
});

describe("matchWorkflowTrigger", () => {
  test("matches case-insensitively, first template wins", () => {
    expect(matchWorkflowTrigger("make a MINIMAX VIDEO please", [VIDEO, ENTITY,],),).toBe(VIDEO,);
    expect(matchWorkflowTrigger("nothing relevant", [VIDEO, ENTITY,],),).toBeUndefined();
    expect(matchWorkflowTrigger("anything", [],),).toBeUndefined();
  });
});

describe("matchWorkflowIntent", () => {
  function makeEntityWorkflow(id: string, entityType: string, target: string,): AssistantWorkflowConfig {
    return {
      id,
      name: id,
      intent: { type: "generate", target, },
      entityType,
      steps: [],
      dispatch: { backend: "assistant-create", target: `/create ${target}`, payloadTemplate: {}, },
    };
  }
  const NPC = makeEntityWorkflow("entity-npc", "npc", "npc",);
  const ITEM = makeEntityWorkflow("entity-item", "item", "item",);

  test("routes a generate-intent message to the matching target", () => {
    expect(matchWorkflowIntent("I need a new npc for the tavern", [NPC, ITEM,],),).toBe(NPC,);
    expect(matchWorkflowIntent("create a shiny item", [NPC, ITEM,],),).toBe(ITEM,);
  });

  test("the npc target is reachable and does not shadow character", () => {
    const CHAR = makeEntityWorkflow("entity-character", "character", "character",);
    expect(matchWorkflowIntent("I need a new npc for the tavern", [CHAR, NPC,],),).toBe(NPC,);
  });

  test("returns undefined when nothing matches (no false positives)", () => {
    expect(matchWorkflowIntent("design a location for my campaign", [NPC, ITEM,],),).toBeUndefined();
    expect(matchWorkflowIntent("what is the weather like", [NPC, ITEM,],),).toBeUndefined();
  });

  test("prose containing intent nouns does not start a workflow", () => {
    const CHAR = makeEntityWorkflow("entity-character", "character", "character",);
    const LOC = makeEntityWorkflow("entity-location", "location", "location",);
    expect(matchWorkflowIntent("we make our way toward the character", [CHAR, NPC, ITEM,],),).toBeUndefined();
    expect(matchWorkflowIntent("the world map location of X", [LOC,],),).toBeUndefined();
    expect(matchWorkflowIntent("make camp before the npc wakes", [NPC, ITEM,],),).toBeUndefined();
  });

  test("imperative generation openers still route", () => {
    const CHAR = makeEntityWorkflow("entity-character", "character", "character",);
    expect(matchWorkflowIntent("make me a character named Y", [CHAR, NPC, ITEM,],),).toBe(CHAR,);
    expect(matchWorkflowIntent("Please generate a new npc", [NPC, ITEM,],),).toBe(NPC,);
    // Leading whitespace is tolerated — the anchor trims before testing.
    expect(matchWorkflowIntent("  create a shiny item", [NPC, ITEM,],),).toBe(ITEM,);
  });

  test("non-generate intents never match by keyword", () => {
    const TOOL: AssistantWorkflowConfig = {
      ...ITEM,
      intent: { type: "tool_exec", target: "summarize", },
    };
    expect(matchWorkflowIntent("summarize this please", [TOOL,],),).toBeUndefined();
  });
});

describe("routeAssistantMessage", () => {
  test("slash command beats workflow trigger", () => {
    const target = routeAssistantMessage({
      message: "/create minimax video",
      workflows: [VIDEO,],
      isStoryMode: true,
    },);
    expect(target,).toEqual({ kind: "command", name: "create", },);
  });

  test("workflow trigger beats story-mode GM", () => {
    const target = routeAssistantMessage({
      message: "minimax video of a harbor",
      workflows: [VIDEO,],
      isStoryMode: true,
    },);
    expect(target.kind,).toBe("workflow",);
    if (target.kind === "workflow") {
      expect(target.workflow.id,).toBe("video-minimax-h3",);
    }
  });

  test("unmatched story message routes to GM, plain message to chat", () => {
    expect(routeAssistantMessage({ message: "hello all", workflows: [], isStoryMode: true, },),).toEqual({
      kind: "gm",
    },);
    expect(routeAssistantMessage({ message: "hello all", workflows: [], isStoryMode: false, },),).toEqual({
      kind: "chat",
    },);
  });

  test("never returns undefined (no silent fallthrough)", () => {
    for (const message of ["", "   ", "/unknown-cmd arg", "???",]) {
      const target = routeAssistantMessage({ message, workflows: [VIDEO, ENTITY,], isStoryMode: false, },);
      expect(target,).toBeDefined();
      expect(target.kind,).toMatch(/^(command|workflow|gm|chat)$/,);
    }
  });
});

describe("withShadowSteering", () => {
  test("appends steering block and no-ops on empty steering", () => {
    expect(withShadowSteering("prompt", "<shadow_notes>x</shadow_notes>",),).toBe(
      "prompt\n\n<shadow_notes>x</shadow_notes>",
    );
    expect(withShadowSteering("prompt", "   ",),).toBe("prompt",);
  });
});
