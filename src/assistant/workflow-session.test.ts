// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the workflow session store: one active run per chat.

import { describe, expect, test, } from "bun:test";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import {
  cancelSession,
  clearSessions,
  getSession,
  nextStepId,
  startSession,
} from "./workflow-session";

function makeWorkflow(id: string,): AssistantWorkflowConfig {
  return {
    id,
    name: id,
    steps: [
      { id: "a", name: "A", type: "text", formatTemplate: "A: {value}", },
      { id: "b", name: "B", type: "text", formatTemplate: "B: {value}", },
    ],
    dispatch: { backend: "b", target: "t", payloadTemplate: {}, },
  };
}

describe("workflow sessions", () => {
  test("start/get/cancel round-trip per chat", () => {
    clearSessions();
    expect(getSession("chat-1",),).toBeUndefined();
    const session = startSession("chat-1", makeWorkflow("w",),);
    expect(getSession("chat-1",),).toBe(session,);
    expect(getSession("chat-2",),).toBeUndefined();
    expect(cancelSession("chat-1",),).toBe(true,);
    expect(cancelSession("chat-1",),).toBe(false,);
    expect(getSession("chat-1",),).toBeUndefined();
  });

  test("starting replaces the previous run", () => {
    clearSessions();
    const first = startSession("chat-1", makeWorkflow("w1",),);
    const second = startSession("chat-1", makeWorkflow("w2",),);
    expect(second,).not.toBe(first,);
    expect(getSession("chat-1",)?.workflow.id,).toBe("w2",);
    clearSessions();
  });

  test("nextStepId follows fill order", () => {
    clearSessions();
    const session = startSession("chat-1", makeWorkflow("w",),);
    expect(nextStepId(session,),).toBe("a",);
    session.run.values.a = "filled";
    expect(nextStepId(session,),).toBe("b",);
    session.run.values.b = "filled";
    expect(nextStepId(session,),).toBeUndefined();
    clearSessions();
  });
});
