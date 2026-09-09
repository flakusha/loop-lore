// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for src/regex/template.ts.
 *
 * Lives in a separate file (rather than appending to template.test.ts)
 * to avoid shared-state issues: INCLUDE_DIRECTIVE and I18N_DIRECTIVE are
 * global regex instances with /g flag — tests in the same describe block
 * can leave lastIndex on, and tests across describes share the same regex
 * instance. These tests construct fresh regex instances and explicitly
 * reset lastIndex on every call to stay decoupled from module-level state.
 */
import { describe, expect, it, } from "bun:test";
import {
  HTML_EXTENSION,
  TITLE_TAG,
} from "./template";

const INCLUDE_DIRECTIVE_FRESH = /\{\{>\s*([\w./-]+)\s*\}\}/g;
const I18N_DIRECTIVE_FRESH = /\{\{\{t\("([^"]+)"\)\}\}\}/g;
const ICON_DIRECTIVE_FRESH = /\{\{icon:([\w-]+)\}\}/g;

function include(s: string,) {
  INCLUDE_DIRECTIVE_FRESH.lastIndex = 0;
  return INCLUDE_DIRECTIVE_FRESH.exec(s,);
}
function i18n(s: string,) {
  I18N_DIRECTIVE_FRESH.lastIndex = 0;
  return I18N_DIRECTIVE_FRESH.exec(s,);
}
function icon(s: string,) {
  ICON_DIRECTIVE_FRESH.lastIndex = 0;
  return ICON_DIRECTIVE_FRESH.exec(s,);
}

describe("INCLUDE_DIRECTIVE — path-traversal contract", () => {
  // The character class [\w./-]+ allows word chars, dot, slash, hyphen.
  // Path traversal segments like ".." match the regex. Whether the
  // downstream renderer escapes the include template dir is a separate
  // concern; the regex itself does NOT enforce that boundary.

  it("captures ../etc/passwd", () => {
    expect(include("{{> ../etc/passwd}}",)?.[1],).toBe("../etc/passwd",);
  });

  it("captures deep traversal segments", () => {
    expect(include("{{> ../../../../tmp/x}}",)?.[1],).toBe("../../../../tmp/x",);
  });

  it("captures literal './a/b'", () => {
    expect(include("{{> ./a/b}}",)?.[1],).toBe("./a/b",);
  });

  it("captures 'a/b/../c' as-is (does not normalize the path)", () => {
    expect(include("{{> a/b/../c}}",)?.[1],).toBe("a/b/../c",);
  });

  it("accepts file paths with extensions", () => {
    expect(include("{{> a-b/c.png}}",)?.[1],).toBe("a-b/c.png",);
  });

  it("rejects @host", () => {
    expect(include("{{> @host}}",),).toBeNull();
  });

  it("rejects names with spaces", () => {
    expect(include("{{> a space}}",),).toBeNull();
  });

  it("rejects non-word punctuation", () => {
    expect(include("{{> %.%}}",),).toBeNull();
  });

  it("captures long paths with deep nesting (no path-length cap)", () => {
    const deep = "a/".repeat(5000,) + "leaf";
    expect(include("{{> " + deep + "}}",)?.[1]?.length,).toBe(deep.length,);
  });

  it("captures multiple includes in a single string", () => {
    INCLUDE_DIRECTIVE_FRESH.lastIndex = 0;
    const result = "header {{> a }} body {{> b }} tail".matchAll(INCLUDE_DIRECTIVE_FRESH,);
    const found = [...result,].map(m => m[1]);
    expect(found,).toEqual(["a", "b",],);
  });
});

describe("I18N_DIRECTIVE — key injection contract", () => {
  it("extracts errors.notFound", () => {
    expect(i18n('{{{t("errors.notFound")}}}',)?.[1],).toBe("errors.notFound",);
  });

  it("extracts keys with dots", () => {
    expect(i18n('{{{t("errors.with.dots")}}}',)?.[1],).toBe("errors.with.dots",);
  });

  it("extracts a single-character key", () => {
    expect(i18n('{{{t("a")}}}',)?.[1],).toBe("a",);
  });

  it("extracts keys with colons", () => {
    expect(i18n('{{{t("errors:colon")}}}',)?.[1],).toBe("errors:colon",);
  });

  it("rejects empty keys", () => {
    expect(i18n('{{{t("")}}}',),).toBeNull();
  });

  it("rejects missing-trio (only 2 opening braces)", () => {
    expect(i18n('{{t("x")}}}',),).toBeNull();
  });

  it("rejects unclosed quote", () => {
    expect(i18n('{{{t("unclosed")',),).toBeNull();
  });

  it("rejects single quotes", () => {
    expect(i18n("{{{t('single')}}}",),).toBeNull();
  });

  it("rejects unquoted argument", () => {
    expect(i18n("{{{t(unquoted)}}}",),).toBeNull();
  });

  it("captures 'a)}}}b' as a valid key (regex allows braces inside chars)", () => {
    // Pin: the regex's character class allows braces inside a key.
    // A request like '{{{t("a)}}}b")}}}}' has key 'a)}}}b'. Downstream
    // i18n lookup is responsible for rejecting weird keys.
    expect(i18n('{{{t("a)}}}b")}}}',)?.[1],).toBe("a)}}}b",);
  });

  it("captures very long keys (no max-length)", () => {
    const long = "x".repeat(10_000,);
    const m = i18n(`{{{t("${long}")}}}`,);
    expect(m?.[1]?.length,).toBe(10_000,);
  });
});

describe("ICON_DIRECTIVE — edge cases", () => {
  it("matches a simple name", () => {
    expect(icon("{{icon:foo}}",)?.[1],).toBe("foo",);
  });

  it("matches a hyphenated name", () => {
    expect(icon("{{icon:foo-bar}}",)?.[1],).toBe("foo-bar",);
  });

  it("matches a single-character name", () => {
    expect(icon("{{icon:a}}",)?.[1],).toBe("a",);
  });

  it("matches underscore names (word char class includes underscore)", () => {
    expect(icon("{{icon:foo_bar}}",)?.[1],).toBe("foo_bar",);
  });

  it("rejects name with space", () => {
    expect(icon("{{icon:foo bar}}",),).toBeNull();
  });

  it("rejects name with slash", () => {
    expect(icon("{{icon:foo/}}",),).toBeNull();
  });

  it("rejects name with extra colon", () => {
    expect(icon("{{icon:foo:bar}}",),).toBeNull();
  });

  it("rejects empty name", () => {
    expect(icon("{{icon:}}",),).toBeNull();
  });

  it("captures long icon names (no max-length)", () => {
    const long = "x".repeat(1000,);
    expect(icon(`{{icon:${long}}}`,)?.[1]?.length,).toBe(1000,);
  });
});

describe("TITLE_TAG — DoS / performance contract", () => {
  it("matches a single title with nested elements", () => {
    expect(TITLE_TAG.test("<title>Some <em>nested</em></title>",),).toBe(true,);
  });

  it("does not match across multiple title tags (lazy quantifier)", () => {
    // Lazy, so it matches the FIRST closing </title>, not all the way to the last.
    const m = TITLE_TAG.exec("<title>A</title><title>B</title>",);
    expect(m?.[0],).toBe("<title>A</title>",);
  });

  it("does not match self-closed title", () => {
    expect(TITLE_TAG.test("<title/>",),).toBe(false,);
  });

  it("is case-sensitive (lowercase only)", () => {
    expect(TITLE_TAG.test("<TITLE>X</TITLE>",),).toBe(false,);
  });

  it("completes quickly on input with many openers", () => {
    // Lazy quantifier short-circuits at the first close. Should be fast.
    const adversarial = "<title>".repeat(1000,) + "content</title>";
    const t0 = performance.now();
    TITLE_TAG.exec(adversarial,);
    const elapsed = performance.now() - t0;
    expect(elapsed,).toBeLessThan(50,);
  });

  it("completes in linear time on huge input with a single title span", () => {
    const huge = "<title>" + "x".repeat(1_000_000,) + "</title>";
    const t0 = performance.now();
    TITLE_TAG.exec(huge,);
    const elapsed = performance.now() - t0;
    expect(elapsed,).toBeLessThan(200,);
  });
});

describe("HTML_EXTENSION — boundary", () => {
  it.each([
    ".html",
    "a.html",
    ".htm",
    "x.HTML",
    "x.HtM",
    ".HTM",
  ],)("matches %s", (input,) => {
    expect(HTML_EXTENSION.test(input,),).toBe(true,);
  },);

  it.each([
    "html",
    "htmlx",
    "xhtml",
    "x-csshtml",
    "a.html.bak",
    "a.htmx",
    "a.HTML.bak",
  ],)("rejects %s", (input,) => {
    expect(HTML_EXTENSION.test(input,),).toBe(false,);
  },);

  it("is case-insensitive", () => {
    for (const c of ["a.Html", "a.hTml", "a.HtMl", "a.hTMl",]) {
      expect(HTML_EXTENSION.test(c,),).toBe(true,);
    }
  });
});
