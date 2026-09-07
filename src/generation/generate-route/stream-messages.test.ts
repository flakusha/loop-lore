// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/generate-route/stream-messages.ts — canonical
 * tool-call mappers for the streaming path.
 */
import { describe, expect, it, } from "bun:test";
import { buildToolCallAssistantMessage, toGenerationToolCalls, } from "./stream-messages";

describe("toGenerationToolCalls", () => {
  it("returns an empty array for no tool calls", () => {
    expect(toGenerationToolCalls([],),).toEqual([],);
  });

  it("maps provider tool calls to the canonical shape", () => {
    const result = toGenerationToolCalls([
      { id: "call-1", function: { name: "roll_dice", arguments: '{"sides":20}', }, },
      { id: "call-2", function: { name: "lookup_lore", arguments: '{"q":"dragon"}', }, },
    ],);

    expect(result,).toEqual([
      {
        id: "call-1",
        type: "function",
        function: { name: "roll_dice", arguments: '{"sides":20}', },
      },
      {
        id: "call-2",
        type: "function",
        function: { name: "lookup_lore", arguments: '{"q":"dragon"}', },
      },
    ],);
  });

  it("preserves argument strings verbatim without parsing", () => {
    const raw = '{"nested":{"deep":[1,2,3]}}';
    const [only,] = toGenerationToolCalls([
      { id: "x", function: { name: "n", arguments: raw, }, },
    ],);
    expect(only?.function.arguments,).toBe(raw,);
  });
});

describe("buildToolCallAssistantMessage", () => {
  it("coerces empty content to an empty string", () => {
    const message = buildToolCallAssistantMessage("", [
      { id: "call-1", function: { name: "f", arguments: "{}", }, },
    ],);
    expect(message,).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-1", type: "function", function: { name: "f", arguments: "{}", }, },
      ],
    },);
  });

  it("keeps non-empty content and maps the tool calls", () => {
    const message = buildToolCallAssistantMessage("Let me check that.", [
      { id: "call-9", function: { name: "inspect", arguments: "[1]", }, },
    ],);
    expect(message.role,).toBe("assistant",);
    expect(message.content,).toBe("Let me check that.",);
    expect(message.tool_calls,).toHaveLength(1,);
    expect(message.tool_calls?.[0]?.id,).toBe("call-9",);
  });

  it("builds an assistant message with no tool calls", () => {
    const message = buildToolCallAssistantMessage("plain reply", [],);
    expect(message,).toEqual({
      role: "assistant",
      content: "plain reply",
      tool_calls: [],
    },);
  });
});
