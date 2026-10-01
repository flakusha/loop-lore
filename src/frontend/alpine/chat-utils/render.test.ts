// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chatUtilsRender — markdown rendering + HTML escaping.
 *
 * The fail-safe path (marked/DOMPurify absent) relies on the browser's
 * textContent → getHTML serialization, so the test installs a fake
 * createElement whose getHTML mimics browser text-node escaping
 * (& < > escaped; quotes left as-is).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { chatUtilsRender, } from "./render";

type VendorGlobals = { __marked?: unknown; __DOMPurify?: unknown };

// `clearMarkdownLibs` deletes these, and it must keep doing so: the fail-safe
// tests below assert renderMarkdown's behaviour when the libs are ABSENT. But
// `__marked`/`__DOMPurify` are installed by src/frontend/chat-vendor.ts for the
// whole app, so deleting them here destroys a global later test files read.
// Snapshot at module load and restore the exact load-time state in afterAll.
const realMarked = (globalThis as VendorGlobals).__marked;
const realDOMPurify = (globalThis as VendorGlobals).__DOMPurify;

/** Browser text-node serialization: only &, <, > are escaped in text nodes. */
function browserEscape(text: string,): string {
  return text.replace(/&/g, "&amp;",).replace(/</g, "&lt;",).replace(/>/g, "&gt;",);
}

type FakeDiv = { textContent: string; getHTML: () => string };

const doc = globalThis.document as unknown as {
  createElement: (tag: string,) => FakeDiv;
};
const originalCreateElement = doc.createElement;

/** Record of marked.parse / DOMPurify.sanitize calls for the happy path. */
let markedInputs: string[] = [];
let sanitizeInputs: { html: string; config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] } }[] = [];

function installMarkdownLibs(): void {
  markedInputs = [];
  sanitizeInputs = [];
  (globalThis as unknown as { __marked?: unknown }).__marked = {
    parse: (content: string,) => {
      markedInputs.push(content,);
      return `<p>${content}</p>`;
    },
  };
  (globalThis as unknown as { __DOMPurify?: unknown }).__DOMPurify = {
    sanitize: (html: string, config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] },) => {
      sanitizeInputs.push({ html, config, },);
      return `sanitized(${html})`;
    },
  };
}

function clearMarkdownLibs(): void {
  delete (globalThis as unknown as { __marked?: unknown }).__marked;
  delete (globalThis as unknown as { __DOMPurify?: unknown }).__DOMPurify;
}

beforeEach(() => {
  doc.createElement = (_tag: string,) => {
    const div: FakeDiv = {
      textContent: "",
      getHTML() {
        return browserEscape(this.textContent,);
      },
    };
    return div;
  };
},);

afterEach(() => {
  doc.createElement = originalCreateElement;
  clearMarkdownLibs();
},);

afterAll(() => {
  (globalThis as VendorGlobals).__marked = realMarked;
  (globalThis as VendorGlobals).__DOMPurify = realDOMPurify;
},);

describe("chatUtilsRender.renderMarkdown", () => {
  it("returns empty string for empty content without touching libs", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.renderMarkdown!("",),).toBe("",);
    expect(markedInputs,).toEqual([],);
  });

  it("escapes raw HTML when marked and DOMPurify are both missing (fail-safe)", () => {
    clearMarkdownLibs();
    const html = chatUtilsRender.renderMarkdown!('<script>alert(1)</script> & "quotes"',);
    expect(html,).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; "quotes"',);
    expect(markedInputs,).toEqual([],);
  });

  it("escapes raw HTML when only marked is missing", () => {
    clearMarkdownLibs();
    (globalThis as unknown as { __DOMPurify?: unknown }).__DOMPurify = {
      sanitize: () => "should not be called",
    };
    const html = chatUtilsRender.renderMarkdown!("<b>bold</b>",);
    expect(html,).toBe("&lt;b&gt;bold&lt;/b&gt;",);
  });

  it("escapes raw HTML when only DOMPurify is missing", () => {
    clearMarkdownLibs();
    (globalThis as unknown as { __marked?: unknown }).__marked = {
      parse: () => "<b>bold</b>",
    };
    const html = chatUtilsRender.renderMarkdown!("<b>bold</b>",);
    expect(html,).toBe("&lt;b&gt;bold&lt;/b&gt;",);
  });

  it("routes through marked + DOMPurify when both libs are present", () => {
    installMarkdownLibs();
    const out = chatUtilsRender.renderMarkdown!("hello **world**",);
    expect(markedInputs,).toEqual(["hello **world**",],);
    expect(sanitizeInputs.length,).toBe(1,);
    expect(sanitizeInputs[0]?.html,).toBe("<p>hello **world**</p>",);
    expect(out,).toBe("sanitized(<p>hello **world**</p>)",);
  });

  it("passes the full allowlist config to DOMPurify", () => {
    installMarkdownLibs();
    chatUtilsRender.renderMarkdown!("x",);
    const config = sanitizeInputs[0]?.config;
    expect(config,).toBeDefined();
    for (
      const tag of [
        "b",
        "i",
        "em",
        "strong",
        "a",
        "p",
        "br",
        "ul",
        "ol",
        "li",
        "h1",
        "h6",
        "code",
        "pre",
        "blockquote",
        "table",
        "thead",
        "td",
        "th",
        "tr",
        "hr",
        "img",
        "del",
        "ins",
        "sup",
        "sub",
        "details",
        "summary",
        "div",
        "span",
      ]
    ) {
      expect(config?.ALLOWED_TAGS.includes(tag,),).toBe(true,);
    }
    for (const attr of ["href", "src", "alt", "title", "class", "target", "rel",]) {
      expect(config?.ALLOWED_ATTR.includes(attr,),).toBe(true,);
    }
  });

  it("treats whitespace-only content as renderable (truthy boundary)", () => {
    installMarkdownLibs();
    const out = chatUtilsRender.renderMarkdown!("   ",);
    expect(markedInputs,).toEqual(["   ",],);
    expect(out,).toBe("sanitized(<p>   </p>)",);
  });

  it("passes unicode content through marked verbatim", () => {
    installMarkdownLibs();
    chatUtilsRender.renderMarkdown!("héllo 世界 🎲",);
    expect(markedInputs,).toEqual(["héllo 世界 🎲",],);
  });

  it("sanitizes marked output rather than the raw source", () => {
    installMarkdownLibs();
    chatUtilsRender.renderMarkdown!("<img src=x onerror=alert(1)>",);
    // marked receives the raw markdown; DOMPurify receives marked's HTML output.
    expect(markedInputs,).toEqual(["<img src=x onerror=alert(1)>",],);
    expect(sanitizeInputs[0]?.html,).toBe("<p><img src=x onerror=alert(1)></p>",);
  });
});

describe("chatUtilsRender.escapeHtml", () => {
  it("escapes ampersands first so entities are not double-escaped", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("&lt;",),).toBe("&amp;lt;",);
  });

  it("escapes angle brackets", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("<b>",),).toBe("&lt;b&gt;",);
  });

  it("leaves quotes untouched (text-node serialization)", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("\"quoted\" 'single'",),).toBe("\"quoted\" 'single'",);
  });

  it("returns empty string for empty input", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("",),).toBe("",);
  });

  it("escapes unicode content without mangling it", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("世界 <b>",),).toBe("世界 &lt;b&gt;",);
  });

  it("escapes ampersands and brackets together in one pass", () => {
    clearMarkdownLibs();
    expect(chatUtilsRender.escapeHtml!("<&>",),).toBe("&lt;&amp;&gt;",);
  });

  it("treats undefined content as empty without touching libs", () => {
    clearMarkdownLibs();
    markedInputs = [];
    expect(chatUtilsRender.renderMarkdown!(undefined as unknown as string,),).toBe("",);
    expect(markedInputs,).toEqual([],);
  });
});
