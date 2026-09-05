// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  DANGEROUS_TAGS,
  JS_URL_ATTR,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  ON_EVENT_UNQUOTED,
  stripScriptTags,
} from "./html-sanitize";

// ── Script Tag ────────────────────────────────────────────

describe("stripScriptTags", () => {
  test("removes simple script tag", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(stripScriptTags(html,),).toBe("<p>Hello</p><p>World</p>",);
  });

  test("removes multiline script tag", () => {
    const html = '<script type="text/javascript">\nalert("xss");\n</script>';
    expect(stripScriptTags(html,),).toBe("",);
  });

  test("removes script with attributes", () => {
    const html = '<script src="/evil.js" async></script>';
    expect(stripScriptTags(html,),).toBe("",);
  });

  test("preserves non-script content", () => {
    const html = "<p>Safe content</p>";
    expect(stripScriptTags(html,),).toBe("<p>Safe content</p>",);
  });

  test("preserves non-script words sharing the prefix", () => {
    const html = "<scripture>not script</scripture>";
    expect(stripScriptTags(html,),).toBe(html,);
  });

  test("removes uppercase script tag case-insensitively", () => {
    const html = "<SCRIPT>alert(1)</SCRIPT>";
    expect(stripScriptTags(html,),).toBe("",);
  });

  test("handles many unterminated <script prefixes in linear time", () => {
    // The former SCRIPT_TAG regex nested-quantifier backtracked quadratically
    // here (~428ms on a 56KB input and minutes on 280KB); the linear scanner
    // must complete and return the input unchanged.
    const s = "<script".repeat(40_000,);
    expect(stripScriptTags(s,),).toBe(s,);
  });
});

describe("ON_EVENT_DOUBLE", () => {
  test('strips onclick="..."', () => {
    expect('<div onclick="alert(1)">click</div>'.replace(ON_EVENT_DOUBLE, "",),).toBe("<div >click</div>",);
  });

  test('strips onerror="..."', () => {
    expect('<img src="x" onerror="alert(1)">'.replace(ON_EVENT_DOUBLE, "",),).toBe('<img src="x" >',);
  });

  test('strips onload="..."', () => {
    expect('<body onload="evil()">'.replace(ON_EVENT_DOUBLE, "",),).toBe("<body >",);
  });
});

describe("ON_EVENT_SINGLE", () => {
  test("strips onclick='...'", () => {
    expect("<div onclick='alert(1)'>click</div>".replace(ON_EVENT_SINGLE, "",),).toBe("<div >click</div>",);
  });
});

describe("ON_EVENT_UNQUOTED", () => {
  test("strips unquoted onerror=...", () => {
    expect("<img src=x onerror=alert(1)>".replace(ON_EVENT_UNQUOTED, "",),).toBe("<img src=x >",);
  });

  test("strips unquoted onload=...", () => {
    expect("<img src=x onload=evil()>".replace(ON_EVENT_UNQUOTED, "",),).toBe("<img src=x >",);
  });

  test("strips unquoted onclick=... before >", () => {
    expect("<div onclick=alert(1) >".replace(ON_EVENT_UNQUOTED, "",),).toBe("<div  >",);
  });
});

describe("JS_URL_ATTR", () => {
  test('strips href="javascript:..."', () => {
    expect('<a href="javascript:alert(1)">link</a>'.replace(JS_URL_ATTR, "",),).toBe("<a >link</a>",);
  });

  test('strips src="javascript:..."', () => {
    expect('<iframe src="javascript:void(0)">'.replace(JS_URL_ATTR, "",),).toBe("<iframe >",);
  });

  test("strips href='javascript:...'", () => {
    expect("<a href='javascript:void(0)'>link</a>".replace(JS_URL_ATTR, "",),).toBe("<a >link</a>",);
  });

  test("preserves normal href", () => {
    expect('<a href="https://example.com">link</a>'.replace(JS_URL_ATTR, "",),).toBe(
      '<a href="https://example.com">link</a>',
    );
  });
});

describe("DANGEROUS_TAGS", () => {
  const vectors: Array<[string, string, string,]> = [
    ["<iframe>", '<iframe src="https://evil.com"></iframe>', "",],
    ["<object>", '<object data="evil.swf"></object>', "",],
    ["<embed>", '<embed src="evil.swf">', "",],
    ["<style>", "<style>body { background: url(evil) }</style>", "",],
    ["<base>", '<base href="https://evil.com/">', "",],
    ["<form>", '<form action="https://evil.com"><input></form>', "",],
    ["<button>", '<button onclick="alert(1)">click</button>', "",],
    ["<svg>", '<svg onload="alert(1)"></svg>', "",],
    ["<math>", "<math><mscript>alert(1)</mscript></math>", "",],
  ];

  for (const [label, input, expected,] of vectors) {
    test(`strips ${label}`, () => {
      expect(input.replace(DANGEROUS_TAGS, "",),).toBe(expected,);
    });
  }

  test("preserves <input> (markdown task list)", () => {
    expect('<input type="checkbox" disabled="">'.replace(DANGEROUS_TAGS, "",),).toBe(
      '<input type="checkbox" disabled="">',
    );
  });
});

describe("full sanitizeHtml pipeline", () => {
  // Replicate the sanitizeHtml logic from stream-render.ts
  function sanitizeHtml(html: string,): string {
    return stripScriptTags(html,)
      .replaceAll(ON_EVENT_DOUBLE, "",)
      .replaceAll(ON_EVENT_SINGLE, "",)
      .replaceAll(ON_EVENT_UNQUOTED, "",)
      .replaceAll(JS_URL_ATTR, "",)
      .replaceAll(DANGEROUS_TAGS, "",);
  }

  test("strips script tag", () => {
    expect(sanitizeHtml("<script>alert(1)</script>hello",),).toBe("hello",);
  });

  test("strips iframe with javascript: src", () => {
    const input = '<iframe src="javascript:void(0)"></iframe>safe';
    expect(sanitizeHtml(input,),).toBe("safe",);
  });

  test("strips event handlers on img", () => {
    const input = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(input,),).toBe('<img src="x" >',);
  });

  test("strips unquoted event handler", () => {
    expect(sanitizeHtml("<img src=x onerror=alert(1)>",),).toBe("<img src=x >",);
  });

  test("strips javascript: href", () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    expect(sanitizeHtml(input,),).toBe("<a >link</a>",);
  });

  test("preserves safe markdown output", () => {
    const input = '<p>Hello <strong>world</strong></p><a href="https://example.com">link</a><ul><li>item</li></ul>';
    expect(sanitizeHtml(input,),).toBe(input,);
  });
});
