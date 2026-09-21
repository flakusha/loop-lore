// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, describe, expect, test, } from "bun:test";
import {
  applyPortraitLayout,
  createPortraitElement,
  getPortraitPosition,
  getPortraitUrl,
} from "./portrait-manager";

// ── Boundary stubs (extends the shared document from tests/setup-globals.ts) ──

function fakeClassList(): DOMTokenList {
  const tokens = new Set<string>();
  return {
    add: (...names: string[]) => {
      for (const name of names) { tokens.add(name,); }
    },
    remove: (...names: string[]) => {
      for (const name of names) { tokens.delete(name,); }
    },
    contains: (name: string,) => tokens.has(name,),
  } as unknown as DOMTokenList;
}

/** Minimal element covering the DOM surface portrait-manager touches. */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = fakeClassList();
  readonly style = {} as unknown as CSSStyleDeclaration;
  className = "";
  textContent = "";
  src = "";
  alt = "";
  loading = "";
  tagName: string;

  constructor(tag: string,) {
    this.tagName = tag.toUpperCase();
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes,);
  }
}

const originalDocument = globalThis.document;
globalThis.document = {
  ...originalDocument,
  createElement: (tag: string,) => new FakeElement(tag,),
} as unknown as Document;
afterAll(() => {
  globalThis.document = originalDocument;
},);

describe("getPortraitPosition", () => {
  test("maps every role to its scene position", () => {
    expect(getPortraitPosition("assistant",),).toBe("left",);
    expect(getPortraitPosition("user",),).toBe("right",);
    expect(getPortraitPosition("system",),).toBe("center",);
    expect(getPortraitPosition("narration",),).toBe("center",);
  });
});

describe("getPortraitUrl", () => {
  test("absent or empty asset id yields undefined", () => {
    expect(getPortraitUrl(undefined,),).toBeUndefined();
    expect(getPortraitUrl(null,),).toBeUndefined();
    expect(getPortraitUrl("",),).toBeUndefined();
  });

  test("full urls pass through, bare asset ids get the thumb route", () => {
    expect(getPortraitUrl("abc-123",),).toBe("/api/v1/assets/abc-123/thumb",);
    expect(getPortraitUrl("https://cdn.test/p.png",),).toBe("https://cdn.test/p.png",);
    expect(getPortraitUrl("http://cdn.test/p.png",),).toBe("http://cdn.test/p.png",);
    expect(getPortraitUrl("/static/p.png",),).toBe("/static/p.png",);
  });
});

describe("createPortraitElement", () => {
  test("wraps avatar image and name label with position class and custom size", () => {
    const el = createPortraitElement({
      name: "Rin",
      avatarUrl: "/a.png",
      position: "left",
      sizePercent: 50,
    },) as unknown as FakeElement;

    expect(el.className,).toBe("vn-portrait vn-portrait-left",);
    expect(el.style.width,).toBe("50%",);

    const [img, label,] = el.children;
    expect(img?.tagName,).toBe("IMG",);
    expect(img?.src,).toBe("/a.png",);
    expect(img?.alt,).toBe("Rin",);
    expect(img?.className,).toBe("vn-portrait-img",);
    expect(img?.loading,).toBe("lazy",);
    expect(label?.tagName,).toBe("DIV",);
    expect(label?.className,).toBe("vn-portrait-name",);
    expect(label?.textContent,).toBe("Rin",);
  });

  test("omits the avatar image without avatarUrl and defaults width to 35%", () => {
    const el = createPortraitElement({ name: "Auto", position: "center", },) as unknown as FakeElement;

    expect(el.className,).toBe("vn-portrait vn-portrait-center",);
    expect(el.style.width,).toBe("35%",);
    expect(el.children,).toHaveLength(1,);
    expect(el.children[0]?.className,).toBe("vn-portrait-name",);
  });
});

describe("applyPortraitLayout", () => {
  test("split layouts add vn-layout-split with ratio-driven column tracks", () => {
    const el = new FakeElement("div",);
    applyPortraitLayout(el as unknown as HTMLElement, "left",);
    expect(el.classList.contains("vn-layout-split",),).toBe(true,);
    expect(el.style.gridTemplateColumns,).toBe("40% 1fr",);

    applyPortraitLayout(el as unknown as HTMLElement, "right", 30,);
    expect(el.classList.contains("vn-layout-split",),).toBe(true,);
    expect(el.style.gridTemplateColumns,).toBe("1fr 30%",);
  });

  test("center and none clear prior layout classes and column tracks", () => {
    const el = new FakeElement("div",);
    applyPortraitLayout(el as unknown as HTMLElement, "left",);
    el.classList.add("vn-layout-overlay", "vn-layout-below",);
    expect(el.classList.contains("vn-layout-split",),).toBe(true,);

    applyPortraitLayout(el as unknown as HTMLElement, "center",);
    expect(el.classList.contains("vn-layout-split",),).toBe(false,);
    expect(el.classList.contains("vn-layout-overlay",),).toBe(false,);
    expect(el.classList.contains("vn-layout-below",),).toBe(false,);
    expect(el.style.gridTemplateColumns,).toBe("",);

    applyPortraitLayout(el as unknown as HTMLElement, "right",);
    applyPortraitLayout(el as unknown as HTMLElement, "none",);
    expect(el.classList.contains("vn-layout-split",),).toBe(false,);
    expect(el.style.gridTemplateColumns,).toBe("",);
  });
});
