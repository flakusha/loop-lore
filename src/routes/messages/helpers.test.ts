import { describe, expect, test, } from "bun:test";
import { parseToolCalls, } from "./helpers";

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
