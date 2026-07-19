import { describe, expect, test } from "bun:test";
import { minifyCSS, minifyHTMLContent, minifyJS, minifyText } from "./minify";

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

  test("does not strip whitespace from lines that are already flush-left", () => {
    const input = "no indent\n  some indent\nno indent again";
    const expected = "no indent\nsome indent\nno indent again";
    expect(minifyText(input)).toBe(expected);
  });
});

describe("minifyHTMLContent", () => {
  test("removes comments", async () => {
    const result = await minifyHTMLContent("<!-- comment --><p>hello</p>");
    expect(result).not.toContain("<!--");
    expect(result).toContain("<p>hello</p>");
  });

  test("collapses whitespace", async () => {
    const result = await minifyHTMLContent("<div>  hello  </div>");
    expect(result).toBe("<div>hello</div>");
  });

  test("removes redundant attributes", async () => {
    const result = await minifyHTMLContent("<script type=\"text/javascript\">const x=1;</script>");
    expect(result).not.toContain("type=\"text/javascript\"");
  });

  test("handles empty input", async () => {
    const result = await minifyHTMLContent("");
    expect(result).toBe("");
  });

  test("minifies inline CSS", async () => {
    const result = await minifyHTMLContent("<style>body { color: red; }</style>");
    expect(result).toContain("<style>");
    expect(result).not.toContain("  ");
  });

  test("handles full HTML document", async () => {
    const input = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <p>Hello World</p>
</body>
</html>`;
    const result = await minifyHTMLContent(input);
    expect(result).toContain("<!doctype html>");
    expect(result).toContain("<title>Test</title>");
    expect(result).toContain("<p>Hello World</p>");
    expect(result).not.toContain("\n  <meta");
  });
});

describe("minifyCSS", () => {
  test("removes CSS comments", () => {
    const input = "/* header */ .foo { color: red; } /* end */";
    expect(minifyCSS(input)).not.toContain("/*");
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
    const result = minifyCSS(input);
    expect(result).toContain("foo");
    expect(result).toContain("bar");
    expect(result).toContain("red");
    expect(result).not.toContain(" ");
  });

  test("removes block comments with newlines", () => {
    const input = "/* line 1\n   line 2 */\n.foo { color: red; }";
    const result = minifyCSS(input);
    expect(result).not.toContain("/*");
    expect(result).toBe(".foo{color:red}");
  });

  test("removes blank lines", () => {
    const input = ".foo { color: red; }\n\n\n.bar { color: blue; }";
    const result = minifyCSS(input);
    expect(result).toContain(".foo");
    expect(result).toContain(".bar");
    expect(result).not.toContain("\n");
  });

  test("handles @keyframes preserving content", () => {
    const input = `@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}`;
    const result = minifyCSS(input);
    expect(result).toContain("@keyframes spin");
    expect(result).toContain("from");
    expect(result).toContain("to");
    expect(result).toContain("rotate");
  });

  test("merges duplicate properties", () => {
    const input = ".foo { color: red; color: blue; }";
    const result = minifyCSS(input);
    // clean-css uses last value, optimizes color names to hex
    expect(result).not.toContain("color:red");
  });
});

describe("minifyJS", () => {
  test("minifies simple function", async () => {
    const input = "function hello() { return 'world'; }";
    const result = await minifyJS(`export ${input}`);
    expect(result).toContain("hello");
    expect(result.length).toBeLessThan(`export ${input}`.length);
  });

  test("minifies arrow function", async () => {
    const input = "const add = (a, b) => { return a + b; };";
    const result = await minifyJS(`export ${input}`);
    expect(result).toContain("add");
    expect(result.length).toBeLessThan(`export ${input}`.length);
  });

  test("handles empty input", async () => {
    const result = await minifyJS("");
    expect(result).toBe("");
  });

  test("removes comments", async () => {
    const result = await minifyJS("const x = 1; // this is a comment\nconst y = 2;");
    expect(result).not.toContain("//");
  });

  test("preserves functionality", async () => {
    const result = await minifyJS("export function add(a, b) { return a + b; }");
    expect(result).toContain("add");
  });

  test("throws on syntax error", async () => {
    await expect(minifyJS("const x = ;")).rejects.toThrow();
  });
});
