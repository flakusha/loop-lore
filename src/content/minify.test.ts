import { describe, test, expect } from "bun:test";
import { minifyText } from "./minify";

describe("minifyText", () => {
  test("passes normal text through unchanged", () => {
    expect(minifyText("hello world")).toBe("hello world");
  });

  test("collapses multiple blank lines into one", () => {
    const input = "line 1\n\n\n\nline 2";
    const expected = "line 1\n\nline 2";
    expect(minifyText(input)).toBe(expected);
  });

  test("strips leading whitespace from lines", () => {
    const input = "  hello\n    world\n  foo";
    const expected = "hello\nworld\nfoo";
    expect(minifyText(input)).toBe(expected);
  });

  test("preserves single blank lines", () => {
    const input = "a\n\nb";
    expect(minifyText(input)).toBe(input);
  });

  test("handles empty input", () => {
    expect(minifyText("")).toBe("");
  });

  test("strips leading whitespace but preserves indented content after blank", () => {
    const input = "section 1\n\n  indented content\n\nsection 2";
    const expected = "section 1\n\nindented content\n\nsection 2";
    expect(minifyText(input)).toBe(expected);
  });

  test("handles text with no leading whitespace", () => {
    const input = "const x = 1;\nconst y = 2;";
    expect(minifyText(input)).toBe(input);
  });

  test("collapses 5 blank lines to 1", () => {
    const input = "a\n\n\n\n\n\nb";
    const expected = "a\n\nb";
    expect(minifyText(input)).toBe(expected);
  });

  test("does not strip whitespace from lines that are already flush-left", () => {
    const input = "no indent\n  some indent\nno indent again";
    const expected = "no indent\nsome indent\nno indent again";
    expect(minifyText(input)).toBe(expected);
  });
});
