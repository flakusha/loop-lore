// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/frontend/terminal-panel.test.ts — pure-logic tests for the PTY panel
// (approach-B anchor upgrade decision + Alpine state defaults). The WS/xterm
// wiring needs a live DOM + socket and is covered by the panel's presence in
// the layout + the server-side gate tests.

import { describe, expect, test, } from "bun:test";

import { anchorInterceptPath, type ClickLike, terminalPanel, } from "./terminal-panel";

function clickOn(target: unknown, overrides: Partial<ClickLike> = {},): ClickLike {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: target as EventTarget,
    ...overrides,
  };
}

function fakeAnchor(path: string | null,): Element {
  const anchor = {
    getAttribute: (name: string,) => (name === "data-editor-path" ? path : null),
  } as unknown as Element;

  anchor.closest = (selector: string,): Element | null => selector === "a[data-editor-path]" ? anchor : null;

  return anchor;
}

describe("terminalPanel", () => {
  test("starts hidden with no file", () => {
    const state = terminalPanel();
    expect(state.open,).toBe(false,);
    expect(state.filePath,).toBe(null,);
    expect(state.status,).toBe("",);
  });

  test("closePanel resets visibility without touching a missing session", () => {
    const state = terminalPanel();
    state.open = true;
    state.closePanel();
    expect(state.open,).toBe(false,);
  });
});

describe("anchorInterceptPath", () => {
  test("returns the data-editor-path for a plain left-click when enabled", () => {
    expect(anchorInterceptPath(true, clickOn(fakeAnchor("src/views/blog.html",),),),).toBe("src/views/blog.html",);
  });

  test("never intercepts when the terminal is disabled", () => {
    expect(anchorInterceptPath(false, clickOn(fakeAnchor("src/x.ts",),),),).toBe(null,);
  });

  test("ignores modified, non-primary, or already-handled clicks", () => {
    const anchor = fakeAnchor("src/x.ts",);
    expect(anchorInterceptPath(true, clickOn(anchor, { ctrlKey: true, },),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(anchor, { metaKey: true, },),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(anchor, { shiftKey: true, },),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(anchor, { altKey: true, },),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(anchor, { button: 1, },),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(anchor, { defaultPrevented: true, },),),).toBe(null,);
  });

  test("ignores clicks outside open-in-editor anchors", () => {
    const plain = { closest: (): null => null, } as unknown as Element;
    expect(anchorInterceptPath(true, clickOn(plain,),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(null,),),).toBe(null,);
    expect(anchorInterceptPath(true, clickOn(fakeAnchor(null,),),),).toBe(null,);
  });
});
