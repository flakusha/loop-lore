import { describe, test, expect } from "bun:test";
import { normalizeHeaderSlot } from "./htmx-header";

function mockDoc(overrides?: Record<string, any>) {
  const items: HTMLElement[] = [];
  const createElement = (tag: string, attrs?: Record<string, string>) => {
    const el: any = {
      tagName: tag.toUpperCase(),
      children: [] as HTMLElement[],
      parentElement: null,
      remove() {
        const idx = items.indexOf(this);
        if (idx >= 0) items.splice(idx, 1);
      },
      contains(child: any) {
        return this === child || this.children.some((c: any) => c === child || c.contains(child));
      },
    };
    if (attrs) Object.assign(el, attrs);
    items.push(el);
    return el;
  };
  const querySelectorAll = (sel: string) => {
    if (sel === "#header-slot") return items.filter((i: any) => i._id === "header-slot");
    return [];
  };
  const querySelector = (sel: string) => {
    if (sel === "#app-root") return items.find((i: any) => i._id === "app-root") || null;
    return null;
  };
  return { createElement, querySelectorAll, querySelector, ...overrides };
}

describe("normalizeHeaderSlot", () => {
  test("does nothing when app-root is missing", () => {
    const doc = mockDoc({ querySelector: () => null });
    globalThis.document = doc as any;
    expect(() => normalizeHeaderSlot()).not.toThrow();
  });

  test("does nothing when only one header-slot exists", () => {
    const appRoot = {
      _id: "app-root",
      children: [],
      contains: () => true,
      parentElement: { insertBefore: () => {} },
    } as any;
    const header = { _id: "header-slot", children: [{}] } as any;
    const doc = mockDoc({
      querySelectorAll: (sel: string) => (sel === "#header-slot" ? [header] : []),
      querySelector: (sel: string) => (sel === "#app-root" ? appRoot : null),
    });
    globalThis.document = doc as any;
    expect(() => normalizeHeaderSlot()).not.toThrow();
  });

  test("removes empty header-slots", () => {
    let removed = 0;
    const empty = {
      _id: "header-slot",
      children: [],
      remove() {
        removed++;
      },
    } as any;
    const appRoot = { _id: "app-root", children: [], contains: () => false, parentElement: null } as any;
    const doc = mockDoc({
      querySelectorAll: (sel: string) => (sel === "#header-slot" ? [empty, empty] : []),
      querySelector: (sel: string) => (sel === "#app-root" ? appRoot : null),
    });
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed).toBe(2);
  });

  test("handles zero header-slots gracefully", () => {
    const appRoot = { _id: "app-root" } as any;
    const doc = mockDoc({
      querySelectorAll: () => [],
      querySelector: (sel: string) => (sel === "#app-root" ? appRoot : null),
    });
    globalThis.document = doc as any;
    expect(() => normalizeHeaderSlot()).not.toThrow();
  });
});
