import { describe, test, expect } from "bun:test";
import { minifyText, minifyCSS } from "./minify";

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

describe("minifyCSS", () => {
  test("removes CSS comments", () => {
    const input = "/* header */ .foo { color: red; } /* end */";
    expect(minifyCSS(input)).not.toContain("/*");
  });

  test("removes trailing semicolons in blocks", () => {
    const input = ".foo { color: red; background: blue; }";
    expect(minifyCSS(input)).toBe(".foo{color:red;background:blue}");
  });

  test("collapses whitespace around braces", () => {
    const input = ".foo { color: red; }";
    expect(minifyCSS(input)).toBe(".foo{color:red}");
  });

  test("collapses whitespace around colons", () => {
    const input = ".foo { color : red }";
    expect(minifyCSS(input)).toBe(".foo{color:red}");
  });

  test("handles empty input", () => {
    expect(minifyCSS("")).toBe("");
  });

  test("handles multiple selectors", () => {
    const input = ".foo, .bar { color: red; }";
    expect(minifyCSS(input)).toBe(".foo,.bar{color:red}");
  });

  test("handles nested rules (preprocessor-style)", () => {
    const input = ".foo { color: red; .bar { color: blue; } }";
    expect(minifyCSS(input)).toBe(".foo{color:red;.bar{color:blue}}");
  });

  test("removes block comments with newlines", () => {
    const input = "/* line 1\n   line 2 */\n.foo { color: red; }";
    const result = minifyCSS(input);
    expect(result).not.toContain("/*");
    expect(result).toBe(".foo{color:red}");
  });

  test("removes blank lines", () => {
    const input = ".foo { color: red; }\n\n\n.bar { color: blue; }";
    expect(minifyCSS(input)).toBe(".foo{color:red}.bar{color:blue}");
  });

  test("handles @keyframes preserving content", () => {
    const input = `@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}`;
    const result = minifyCSS(input);
    expect(result).toContain("@keyframes");
    expect(result).toContain("spin");
    expect(result).toContain("from");
    expect(result).toContain("to");
  });
});
