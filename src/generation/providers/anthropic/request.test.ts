// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the Anthropic request-body builder (request.ts).
 *
 * Covers the `POST /v1/messages` body construction edge cases:
 *   - system-message extraction (join, empty-content skip)
 *   - role mapping (character → assistant)
 *   - tool-result blocks (tool_use_id fallback, block merging into the
 *     preceding user turn, new user turn after an assistant message)
 *   - model fallback, max_tokens default, system omission
 *   - temperature / top_p / stop_sequences passthrough
 *   - tools mapping
 *   - provider-specific override passthrough vs. STANDARD_KEYS exclusion
 *   - stream flag
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, ToolDef, } from "../types";
import type { AnthropicState, } from "./types";
import { buildBody, buildMessages, mapToolDef, } from "./request";

const state: AnthropicState = {
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-test",
  defaultModel: "claude-default",
  timeout: 60_000,
  retries: 2,
  headers: {},
};

const tool: ToolDef = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather",
    parameters: { type: "object", properties: { city: { type: "string", }, }, },
  },
};

/**
 * @param overrides
 */
function makeReq(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "claude-test",
    messages: [],
    params: {},
    ...overrides,
  };
}

describe("buildMessages", () => {
  test("extracts system messages into one system string joined with a blank line", () => {
    const { system, messages, } = buildMessages([
      { role: "system", content: "You are helpful.", },
      { role: "user", content: "Hi", },
      { role: "system", content: "Be concise.", },
    ],);
    expect(system,).toBe("You are helpful.\n\nBe concise.",);
    expect(messages,).toEqual([{ role: "user", content: "Hi", },],);
  });

  test("skips system messages with empty content", () => {
    const { system, messages, } = buildMessages([
      { role: "system", content: "", },
      { role: "user", content: "Hi", },
    ],);
    expect(system,).toBe("",);
    expect(messages,).toHaveLength(1,);
  });

  test("maps the character role to assistant", () => {
    const { messages, } = buildMessages([
      { role: "character", content: "speaking as the hero", },
    ],);
    expect(messages,).toEqual([{ role: "assistant", content: "speaking as the hero", },],);
  });

  test("maps a tool message to a user turn carrying a tool_result block", () => {
    const { messages, } = buildMessages([
      { role: "assistant", content: "Let me check.", },
      { role: "tool", content: "sunny, 21C", tool_call_id: "tool-1", },
    ],);
    expect(messages,).toEqual([
      { role: "assistant", content: "Let me check.", },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: "sunny, 21C", },],
      },
    ],);
  });

  test("falls back to an empty tool_use_id when the tool message has none", () => {
    const { messages, } = buildMessages([
      { role: "tool", content: "orphan result", },
    ],);
    expect(messages,).toEqual([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "", content: "orphan result", },], },
    ],);
  });

  test("appends a second tool result to the preceding user turn's block array", () => {
    const { messages, } = buildMessages([
      { role: "tool", content: "one", tool_call_id: "t1", },
      { role: "tool", content: "two", tool_call_id: "t2", },
    ],);
    expect(messages,).toHaveLength(1,);
    expect(messages[0],).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "one", },
        { type: "tool_result", tool_use_id: "t2", content: "two", },
      ],
    },);
  });

  test("starts a new user turn when a tool message follows an assistant message", () => {
    const { messages, } = buildMessages([
      { role: "assistant", content: "working on it", },
      { role: "tool", content: "done", tool_call_id: "t9", },
    ],);
    expect(messages,).toEqual([
      { role: "assistant", content: "working on it", },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t9", content: "done", },], },
    ],);
  });

  test("defaults missing content to an empty string", () => {
    const { messages, } = buildMessages([
      { role: "user", content: "", },
    ],);
    expect(messages,).toEqual([{ role: "user", content: "", },],);
  });
});

describe("mapToolDef", () => {
  test("maps the function shape onto the Anthropic tool param", () => {
    expect(mapToolDef(tool,),).toEqual({
      name: "get_weather",
      description: "Get the current weather",
      input_schema: { type: "object", properties: { city: { type: "string", }, }, },
    },);
  });
});

describe("buildBody", () => {
  test("falls back to the state default model when the request model is empty", () => {
    const body = buildBody(state, makeReq({ model: "", },), false,);
    expect(body.model,).toBe("claude-default",);
  });

  test("uses the request model when present", () => {
    const body = buildBody(state, makeReq({ model: "claude-request", },), false,);
    expect(body.model,).toBe("claude-request",);
  });

  test("defaults max_tokens to 4096", () => {
    const body = buildBody(state, makeReq(), false,);
    expect(body.max_tokens,).toBe(4096,);
  });

  test("omits the system field when there are no system messages", () => {
    const body = buildBody(state, makeReq(), false,);
    expect("system" in body,).toBe(false,);
  });

  test("includes the system field when a system message exists", () => {
    const body = buildBody(
      state,
      makeReq({ messages: [{ role: "system", content: "sys", },], },),
      false,
    );
    expect(body.system,).toBe("sys",);
  });

  test("passes through temperature, top_p and stop_sequences", () => {
    const body = buildBody(
      state,
      makeReq({ params: { temperature: 0.5, topP: 0.9, stop: ["END",], }, },),
      false,
    );
    expect(body.temperature,).toBe(0.5,);
    expect(body.top_p,).toBe(0.9,);
    expect(body.stop_sequences,).toEqual(["END",],);
  });

  test("omits stop_sequences when the stop list is empty", () => {
    const body = buildBody(state, makeReq({ params: { stop: [], }, },), false,);
    expect("stop_sequences" in body,).toBe(false,);
  });

  test("maps tools onto the Anthropic tools param", () => {
    const body = buildBody(state, makeReq({ tools: [tool,], },), false,);
    expect(body.tools,).toEqual([mapToolDef(tool),],);
  });

  test("omits the tools param when no tools are given", () => {
    const body = buildBody(state, makeReq(), false,);
    expect("tools" in body,).toBe(false,);
  });

  test("passes through provider-specific override params", () => {
    const body = buildBody(
      state,
      makeReq({
        params: {
          grammar: '{"type":"object"}',
          responseFormat: { type: "json_object", },
          cachePrompt: true,
        },
      },),
      false,
    );
    expect(body.grammar,).toBe('{"type":"object"}',);
    expect(body.responseFormat,).toEqual({ type: "json_object", },);
    expect(body.cachePrompt,).toBe(true,);
  });

  test("does not raw-passthrough keys already mapped to Anthropic fields", () => {
    const body = buildBody(
      state,
      makeReq({
        params: {
          temperature: 0.1,
          maxTokens: 100,
          topP: 0.5,
          stream: true,
          stop: ["A"],
          presencePenalty: 0.1,
          frequencyPenalty: 0.1,
          minP: 0.05,
          topK: 40,
          typicalP: 0.9,
          repeatPenalty: 1.1,
          dryMultiplier: 1.5,
          dryBase: 1.25,
          dryAllowedLength: 4,
          xtcProbability: 0.3,
          dynatempRange: 0.5,
          dynatempExponent: 1.0,
          reasoningBudget: 1024,
        },
      },),
      false,
    );
    // Mapped fields keep their Anthropic names.
    expect(body.temperature,).toBe(0.1,);
    expect(body.max_tokens,).toBe(100,);
    expect(body.top_p,).toBe(0.5,);
    expect(body.stop_sequences,).toEqual(["A",],);
    // stream comes from the argument, not from params.
    expect(body.stream,).toBe(false,);
    // Standard keys are not duplicated under their raw names.
    for (const key of [
      "presencePenalty",
      "frequencyPenalty",
      "minP",
      "topK",
      "typicalP",
      "repeatPenalty",
      "dryMultiplier",
      "dryBase",
      "dryAllowedLength",
      "xtcProbability",
      "dynatempRange",
      "dynatempExponent",
      "reasoningBudget",
      "stop",
    ]) {
      expect(key in body,).toBe(false,);
    }
  });

  test("sets the stream flag from the argument", () => {
    expect(buildBody(state, makeReq(), true,).stream,).toBe(true,);
    expect(buildBody(state, makeReq(), false,).stream,).toBe(false,);
  });
});
