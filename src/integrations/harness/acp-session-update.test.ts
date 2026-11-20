// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ACP session/update narrowing tests: what loop-lore keeps from the raw
 * notification stream and what it drops.
 *
 * Resource contract: pure — no child process, no database, no ports, no
 * module state.
 */
import { describe, expect, it, } from "bun:test";
import { isTerminalToolStatus, narrowSessionUpdate, } from "./acp-session-update";

describe("narrowSessionUpdate", () => {
  it("narrows an agent_message_chunk to a text event", () => {
    const events = narrowSessionUpdate({
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello", }, },
    },);

    expect(events,).toEqual([{ type: "text", text: "hello", },],);
  });

  it("narrows an agent_thought_chunk to a thinking event", () => {
    const events = narrowSessionUpdate({
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm", }, },
    },);

    expect(events,).toEqual([{ type: "thinking", text: "hmm", },],);
  });

  it("narrows a tool_call into a call event with JSON arguments", () => {
    const events = narrowSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "read file",
        kind: "read",
        rawInput: { path: "a.txt", },
      },
    },);

    expect(events,).toEqual([{
      type: "tool-call",
      toolCallId: "tc-1",
      name: "read file",
      kind: "read",
      arguments: '{"path":"a.txt"}',
    },],);
  });

  it("treats a terminal tool_call as the call and its result", () => {
    const events = narrowSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-2",
        name: "grep",
        status: "failed",
        content: [{ type: "content", content: { type: "text", text: "no match", }, },],
      },
    },);

    expect(events,).toHaveLength(2,);
    expect(events[1],).toEqual({
      type: "tool-result",
      toolCallId: "tc-2",
      name: "grep",
      status: "failed",
      content: "no match",
      error: true,
    },);
  });

  it("narrows a tool_call_update into a result", () => {
    const events = narrowSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-3",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "done", }, },],
      },
    },);

    expect(events,).toEqual([{
      type: "tool-result",
      toolCallId: "tc-3",
      name: null,
      status: "completed",
      content: "done",
      error: false,
    },],);
  });

  it("narrows a usage_update into a usage event with its cost", () => {
    const events = narrowSessionUpdate({
      update: {
        sessionUpdate: "usage_update",
        used: 120,
        size: 1000,
        cost: { amount: 0.012, currency: "USD", },
      },
    },);

    expect(events,).toEqual([{
      type: "usage",
      used: 120,
      size: 1000,
      costUsd: 0.012,
      currency: "USD",
    },],);
  });

  it("keeps a usage_update without a cost as a null cost", () => {
    const events = narrowSessionUpdate({
      update: { sessionUpdate: "usage_update", used: 120, size: 1000, },
    },);

    expect(events,).toEqual([{
      type: "usage",
      used: 120,
      size: 1000,
      costUsd: null,
      currency: null,
    },],);
  });

  it("reads the cost of a usage_update that carried no context counters", () => {
    const events = narrowSessionUpdate({
      update: { sessionUpdate: "usage_update", cost: { amount: 0.012, currency: "USD", }, },
    },);

    expect(events,).toEqual([{
      type: "usage",
      used: null,
      size: null,
      costUsd: 0.012,
      currency: "USD",
    },],);
  });

  it("ignores malformed payloads and unknown variants", () => {
    expect(narrowSessionUpdate(null,),).toEqual([],);
    expect(narrowSessionUpdate({},),).toEqual([],);
    expect(narrowSessionUpdate({ update: { sessionUpdate: "plan", entries: [], }, },),).toEqual([],);
    expect(narrowSessionUpdate({ update: { sessionUpdate: "agent_message_chunk", content: { type: "image", }, }, },),)
      .toEqual([],);

    expect(narrowSessionUpdate({ update: { sessionUpdate: "tool_call_update", }, },),).toEqual([],);
  });

  it("leaves an empty result body when the harness reported no content", () => {
    const events = narrowSessionUpdate({
      update: { sessionUpdate: "tool_call_update", toolCallId: "tc-4", status: "completed", },
    },);

    expect(events[0],).toEqual({
      type: "tool-result",
      toolCallId: "tc-4",
      name: null,
      status: "completed",
      content: "",
      error: false,
    },);
  });

  it("narrows a current_mode_update to a mode event", () => {
    const events = narrowSessionUpdate({
      update: { sessionUpdate: "current_mode_update", currentModeId: "plan", },
    },);

    expect(events,).toEqual([{ type: "mode", modeId: "plan", },],);
  });

  it("drops a current_mode_update without a mode id", () => {
    expect(narrowSessionUpdate({ update: { sessionUpdate: "current_mode_update", }, },),).toEqual([],);
  });
});

describe("isTerminalToolStatus", () => {
  it("ends a call only on completed and failed", () => {
    expect(isTerminalToolStatus("completed",),).toBe(true,);
    expect(isTerminalToolStatus("failed",),).toBe(true,);
    expect(isTerminalToolStatus("in_progress",),).toBe(false,);
    expect(isTerminalToolStatus("pending",),).toBe(false,);
    expect(isTerminalToolStatus("",),).toBe(false,);
  });
});
