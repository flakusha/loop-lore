/**
 * Tests for `parseSSELine` (SSE event-line parser for streaming responses).
 *
 * The parser types its payload as `Record<string, string>` (the expected
 * SSE data shape), so object-literal expectations are asserted with a cast.
 */
import { describe, expect, test, } from "bun:test";
import { parseSSELine, } from "./sse";

describe("parseSSELine", () => {
  test("parses a data line into its JSON payload", () => {
    const parsed = parseSSELine(`data: {"choices": []}`,);
    expect(parsed,).toEqual({ choices: [], } as unknown as Record<string, string>,);
  });

  test("trims surrounding whitespace in the payload", () => {
    const parsed = parseSSELine('data:   {"a": 1}  ',);
    expect(parsed,).toEqual({ a: 1, } as unknown as Record<string, string>,);
  });

  test("returns the done marker for [DONE]", () => {
    const parsed = parseSSELine("data: [DONE]",);
    expect(parsed,).toEqual({ _done: "true", },);
  });

  test("returns null for lines without the data: prefix", () => {
    expect(parseSSELine("event: message",),).toBeNull();
    expect(parseSSELine("",),).toBeNull();
    expect(parseSSELine("id: 3",),).toBeNull();
  });

  test("returns null for invalid JSON payloads", () => {
    expect(parseSSELine("data: {not json",),).toBeNull();
    expect(parseSSELine("data: ",),).toBeNull();
  });
});
