// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for assistant → workflow → GM handoff routing.

import { describe, expect, test, } from "bun:test";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import {
  findWorkflowById,
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
