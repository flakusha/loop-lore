// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the Ollama-native HTTP body builder.
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, } from "../types";
import { buildBody, } from "./http";
import type { OllamaNativeState, } from "./types";

const state: OllamaNativeState = {
  baseUrl: "http://localhost:11434",
  apiKey: undefined,
  defaultModel: "llama3.2",
  timeout: 5000,
  retries: 1,
  headers: {},
};

/**
 * @param overrides
 */
function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "llama3.2",
    messages: [{ role: "user", content: "hi", },],
    params: {},
    ...overrides,
  };
}

describe("buildBody", () => {
  test("maps messages with role and content", () => {
    const body = buildBody(state, req(), false,);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.role,).toBe("user",);
    expect(messages[0]!.content,).toBe("hi",);
  });

  test("maps character role to assistant", () => {
    const body = buildBody(
      state,
      req({ messages: [{ role: "character", content: "hello", },], },),
      false,
    );

    const messages = body.messages as Array<{ role: string }>;
    expect(messages[0]!.role,).toBe("assistant",);
  });

  test("includes images as base64 strings when present", () => {
    const body = buildBody(
      state,
      req({
        messages: [{
          role: "user",
          content: "what is this?",
          images: [
            { mediaType: "image/png", base64: "aGVsbG8=", },
            { mediaType: "image/jpeg", base64: "d29ybGQ=", },
          ],
        },],
      },),
      false,
    );

    const messages = body.messages as Array<{ images?: string[] }>;
    expect(messages[0]!.images,).toEqual(["aGVsbG8=", "d29ybGQ=",],);
  });

  test("omits images key when no images are present", () => {
    const body = buildBody(state, req(), false,);

    const messages = body.messages as Array<{ images?: string[] }>;
    expect(messages[0]!.images,).toBeUndefined();
  });

  test("omits images key when images array is empty", () => {
    const body = buildBody(
      state,
      req({ messages: [{ role: "user", content: "hi", images: [], },], },),
      false,
    );

    const messages = body.messages as Array<{ images?: string[] }>;
    expect(messages[0]!.images,).toBeUndefined();
  });

  test("maps name, tool_call_id, and tool_calls when present", () => {
    const body = buildBody(
      state,
      req({
        messages: [{
          role: "tool",
          content: "result",
          name: "search",
          tool_call_id: "call-1",
          tool_calls: [{ id: "call-1", type: "function", function: { name: "search", arguments: "{}", }, },],
        },],
      },),
      false,
    );

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]!.name,).toBe("search",);
    expect(messages[0]!.tool_call_id,).toBe("call-1",);
    expect(messages[0]!.tool_calls,).toHaveLength(1,);
  });

  test("applies generation params to options", () => {
    const body = buildBody(
      state,
      req({ params: { temperature: 0.5, maxTokens: 100, }, },),
      false,
    );

    expect(body.options,).toEqual({ temperature: 0.5, num_predict: 100, },);
  });

  test("sets stream flag", () => {
    const body = buildBody(state, req(), true,);
    expect(body.stream,).toBe(true,);
  });
});
