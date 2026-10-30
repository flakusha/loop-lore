// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for approach-A open-in-editor links: scheme mapping, line handling,
 * per-segment path encoding, and anchor hydration against the seeded globals.
 *
 * Resource contract: owns the __EDITOR__ / __EDITOR_FILE_ROOT__ globals for the
 * duration of each test and restores both in afterEach.
 */
import { afterEach, describe, expect, test, } from "bun:test";

import { editorUrl, enhanceOpenInEditorLinks, } from "./open-in-editor";

interface AnchorStub {
  attrs: Map<string, string>;
  removed: string[];
  getAttribute: (name: string,) => string | null;
  setAttribute: (name: string, value: string,) => void;
  removeAttribute: (name: string,) => void;
}

interface RootStub {
  querySelectorAll: (selector: string,) => AnchorStub[];
}

const globals = globalThis as { __EDITOR__?: unknown; __EDITOR_FILE_ROOT__?: unknown };
const originalEditor = globals.__EDITOR__;
const originalRoot = globals.__EDITOR_FILE_ROOT__;

function stubAnchor(path: string | null, line?: string,): AnchorStub {
  const attrs = new Map<string, string>([],);
  const removed: string[] = [];
  if (path !== null) { attrs.set("data-editor-path", path,); }
  if (line !== undefined) { attrs.set("data-editor-line", line,); }
  return {
    attrs,
    removed,
    getAttribute: (name,) => attrs.get(name,) ?? null,
    setAttribute: (name, value,) => {
      attrs.set(name, value,);
    },
    removeAttribute: (name,) => {
      attrs.delete(name,);
      removed.push(name,);
    },
  };
}

afterEach(() => {
  globals.__EDITOR__ = originalEditor;
  globals.__EDITOR_FILE_ROOT__ = originalRoot;
},);

describe("editorUrl", () => {
  test("defaults to vscode://file without a seeded editor", () => {
    globals.__EDITOR__ = undefined;
    expect(editorUrl({ path: "/repo/src/views/blog.html", },),).toBe("vscode://file//repo/src/views/blog.html",);
  });

  test("maps zed and cursor through the file-scheme shape", () => {
    expect(editorUrl({ path: "/a/b.ts", editor: "zed", },),).toBe("zed://file//a/b.ts",);
    expect(editorUrl({ path: "/a/b.ts", editor: "cursor", },),).toBe("cursor://file//a/b.ts",);
  });

  test("idea uses the query-string shape with line", () => {
    expect(editorUrl({ path: "/a/b.ts", line: 12, editor: "idea", },),).toBe(
      "idea://open?file=/a/b.ts&line=12",
    );

    expect(editorUrl({ path: "/a/b.ts", editor: "idea", },),).toBe("idea://open?file=/a/b.ts",);
  });

  test("file schemes append :line and skip it when absent", () => {
    globals.__EDITOR__ = "vscode";
    expect(editorUrl({ path: "/a/b.ts", line: 7, },),).toBe("vscode://file//a/b.ts:7",);
    expect(editorUrl({ path: "/a/b.ts", },),).toBe("vscode://file//a/b.ts",);
  });

  test("unknown editor falls back to vscode", () => {
    globals.__EDITOR__ = "emacsclient";
    expect(editorUrl({ path: "/a/b.ts", },),).toBe("vscode://file//a/b.ts",);
    expect(editorUrl({ path: "/a/b.ts", editor: "neovim", },),).toBe("vscode://file//a/b.ts",);
  });

  test("encodes per segment, preserving separators", () => {
    globals.__EDITOR__ = undefined;
    expect(editorUrl({ path: "/home/u/my repo/src/file.ts", },),).toBe(
      "vscode://file//home/u/my%20repo/src/file.ts",
    );
  });
});

describe("enhanceOpenInEditorLinks", () => {
  test("hydrates href from the seeded root and scheme", () => {
    globals.__EDITOR__ = "zed";
    globals.__EDITOR_FILE_ROOT__ = "/home/u/loop-lore";
    const anchor = stubAnchor("src/views/blog.html", "53",);
    const root: RootStub = { querySelectorAll: () => [anchor,], };
    enhanceOpenInEditorLinks(root as unknown as ParentNode,);
    expect(anchor.attrs.get("href",),).toBe("zed://file//home/u/loop-lore/src/views/blog.html:53",);
    expect(anchor.removed.includes("hidden",),).toBe(true,);
  });

  test("hides anchors when the root global is missing", () => {
    globals.__EDITOR__ = "vscode";
    globals.__EDITOR_FILE_ROOT__ = undefined;
    const anchor = stubAnchor("src/views/blog.html",);
    const root: RootStub = { querySelectorAll: () => [anchor,], };
    enhanceOpenInEditorLinks(root as unknown as ParentNode,);
    expect(anchor.attrs.get("hidden",),).toBe("",);
    expect(anchor.attrs.has("href",),).toBe(false,);
  });

  test("hides anchors without a data-editor-path and tolerates a bad line", () => {
    globals.__EDITOR__ = "vscode";
    globals.__EDITOR_FILE_ROOT__ = "/repo";
    const noPath = stubAnchor(null,);
    const badLine = stubAnchor("src/a.html", "not-a-number",);
    const root: RootStub = { querySelectorAll: () => [noPath, badLine,], };
    enhanceOpenInEditorLinks(root as unknown as ParentNode,);
    expect(noPath.attrs.get("hidden",),).toBe("",);
    expect(badLine.attrs.get("href",),).toBe("vscode://file//repo/src/a.html",);
  });
});
