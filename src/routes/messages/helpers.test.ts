import { describe, expect, test, } from "bun:test";
import { parseToolCalls, parseToolResultMeta, } from "./helpers";

describe("parseToolCalls", () => {
  test("returns null for null/undefined/empty input", () => {
    expect(parseToolCalls(null,),).toBeNull();
    expect(parseToolCalls(undefined,),).toBeNull();
    expect(parseToolCalls("",),).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseToolCalls("not json",),).toBeNull();
    expect(parseToolCalls("{",),).toBeNull();
  });

  test("returns null for non-array or empty array payload", () => {
    expect(parseToolCalls('{"id":"x"}',),).toBeNull();
    expect(parseToolCalls("[]",),).toBeNull();
  });

  test("parses a single tool call", () => {
    const calls = parseToolCalls(
      JSON.stringify([{
        id: "call_1",
        type: "function",
        function: { name: "getWeather", arguments: '{"city":"Tokyo"}', },
      },],),
    );
    expect(calls,).toEqual([
      { id: "call_1", type: "function", function: { name: "getWeather", arguments: '{"city":"Tokyo"}', }, },
    ],);
  });

  test("parses multiple tool calls preserving order", () => {
    const calls = parseToolCalls(
      JSON.stringify([
        { id: "a", type: "function", function: { name: "f1", arguments: "{}", }, },
        { id: "b", type: "function", function: { name: "f2", arguments: "{}", }, },
      ],),
    );
    expect(calls,).toHaveLength(2,);
    expect(calls?.[0]?.function.name,).toBe("f1",);
    expect(calls?.[1]?.function.name,).toBe("f2",);
  });
});

describe("parseToolResultMeta", () => {
  test("returns fail-closed defaults for null/missing input", () => {
    expect(parseToolResultMeta(null,),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta(undefined,),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta("",),).toEqual({ toolName: null, toolError: false, },);
  });

  test("returns fail-closed defaults for garbage/non-object metadata", () => {
    expect(parseToolResultMeta("not json",),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta('"just a string"',),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta("[1,2]",),).toEqual({ toolName: null, toolError: false, },);
  });

  test("parses tool_name and tool_error", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "stub_tool", tool_error: true, },),),).toEqual({
      toolName: "stub_tool",
      toolError: true,
    },);
  });

  test("empty-string name becomes null", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "", },),),).toEqual({
      toolName: null,
      toolError: false,
    },);
  });

  test("truthy non-true tool_error stays false", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "t", tool_error: 1, },),).toolError,).toBe(false,);
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "t", tool_error: "true", },),).toolError,).toBe(false,);
  });
});
