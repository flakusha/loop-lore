// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  DANGEROUS_TAGS,
  JS_URL_ATTR,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  ON_EVENT_UNQUOTED,
  SCRIPT_TAG,
} from "./html-sanitize";

describe("SCRIPT_TAG", () => {
  test("strips <script>...</script>", () => {
    expect("<script>alert(1)</script>hello".replace(SCRIPT_TAG, "",),).toBe("hello",);
  });

  test("strips multiline <script> block", () => {
    const input = "before<script>\n  alert(1);\n</script>after";
    expect(input.replace(SCRIPT_TAG, "",),).toBe("beforeafter",);
  });

  test("strips <script> with attributes", () => {
    expect('<script src="evil.js"></script>safe'.replace(SCRIPT_TAG, "",),).toBe("safe",);
  });

  test("does not match <script> without closing tag (pair-only regex)", () => {
    const input = "before<script>alert(1)after";
    expect(input.replace(SCRIPT_TAG, "",),).toBe(input,);
  });

  test("leaves non-script content intact", () => {
    expect("<p>hello</p>".replace(SCRIPT_TAG, "",),).toBe("<p>hello</p>",);
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
    return html
      .replaceAll(SCRIPT_TAG, "",)
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
