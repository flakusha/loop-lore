import { describe, expect, it, } from "bun:test";
import { CODE_FENCE_JSON, FENCE_OPEN, JSON_ARRAY, } from "./code-fence";

describe("code-fence regex", () => {
  describe("CODE_FENCE_JSON", () => {
    it("extracts JSON from code fence", () => {
      const input = '```json\n{"key": "value"}\n```';
      expect(CODE_FENCE_JSON.exec(input,)?.[1],).toBe('{"key": "value"}',);
    });

    it("extracts from plain code fence", () => {
      const input = "```\n{data}\n```";
      expect(CODE_FENCE_JSON.exec(input,)?.[1],).toBe("{data}",);
    });

    it("handles multiline JSON", () => {
      const input = '```json\n{"items": [\n  1,\n  2\n]}\n```';
      const match = CODE_FENCE_JSON.exec(input,);
      expect(match?.[1],).toContain('"items"',);
    });

    it("returns null for no fence", () => {
      expect(CODE_FENCE_JSON.exec("no code fence here",),).toBeNull();
    });
  });

  describe("JSON_ARRAY", () => {
    it("matches JSON array", () => {
      expect(JSON_ARRAY.test('[{"key": "value"}]',),).toBe(true,);
    });

    it("matches empty array", () => {
      expect(JSON_ARRAY.test("[]",),).toBe(true,);
    });

    it("does not match object", () => {
      expect(JSON_ARRAY.test('{"key": "value"}',),).toBe(false,);
    });
  });

  describe("FENCE_OPEN", () => {
    it("matches ```json fence", () => {
      expect(FENCE_OPEN.exec("```json\n",)?.[0],).toBeTruthy();
    });

    it("matches plain ``` fence", () => {
      expect(FENCE_OPEN.exec("```\n",)?.[0],).toBeTruthy();
    });

    it("returns null for non-fence", () => {
      expect(FENCE_OPEN.exec("not a fence",),).toBeNull();
    });
  });
});
