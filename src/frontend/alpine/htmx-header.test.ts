import { describe, expect, test, } from "bun:test";
import { normalizeHeaderSlot, } from "./htmx-header";

/**
 * @param overrides
 */
function mockDoc(overrides?: Record<string, any>,) {
  const items: HTMLElement[] = [];
  const createElement = (tag: string, attrs?: Record<string, string>,) => {
    const el: any = {
      tagName: tag.toUpperCase(),
      children: [] as HTMLElement[],
      parentElement: null,
      remove() {
        const idx = items.indexOf(this,);
        if (idx !== -1) { items.splice(idx, 1,); }
      },
      contains(child: any,) {
        return this === child || this.children.some((c: any,) => c === child || c.contains(child,));
      },
    };
    if (attrs) { Object.assign(el, attrs,); }
    items.push(el,);
    return el;
  };
  const querySelectorAll = (sel: string,) => {
    if (sel === "#header-slot") { return items.filter((i: any,) => i._id === "header-slot"); }
    return [];
  };
  const querySelector = (sel: string,) => {
    if (sel === "#app-root") { return items.find((i: any,) => i._id === "app-root") || null; }
    return null;
  };
  return { createElement, querySelectorAll, querySelector, ...overrides, };
}

describe("normalizeHeaderSlot", () => {
  test("does nothing when app-root is missing", () => {
    const doc = mockDoc({ querySelector: () => null, },);
    globalThis.document = doc as any;
    expect(() => normalizeHeaderSlot()).not.toThrow();
  });

  test("does nothing when only one header-slot exists", () => {
    const appRoot = {
      _id: "app-root",
      children: [],
      contains: () => true,
      parentElement: { insertBefore: () => {}, },
    } as any;
    const header = { _id: "header-slot", children: [{},], } as any;
    const doc = mockDoc({
      querySelectorAll: (sel: string,) => (sel === "#header-slot" ? [header,] : []),
      querySelector: (sel: string,) => (sel === "#app-root" ? appRoot : null),
    },);
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
    const appRoot = { _id: "app-root", children: [], contains: () => false, parentElement: null, } as any;
    const doc = mockDoc({
      querySelectorAll: (sel: string,) => (sel === "#header-slot" ? [empty, empty,] : []),
      querySelector: (sel: string,) => (sel === "#app-root" ? appRoot : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toBe(2,);
  });

  test("handles zero header-slots gracefully", () => {
    const appRoot = { _id: "app-root", } as any;
    const doc = mockDoc({
      querySelectorAll: () => [],
      querySelector: (sel: string,) => (sel === "#app-root" ? appRoot : null),
    },);
    globalThis.document = doc as any;
    expect(() => normalizeHeaderSlot()).not.toThrow();
  });
});

/** A header-slot double that records removals and hides from later queries. */
function slot(children: number, removed: any[],): any {
  return {
    _id: "header-slot",
    _removed: false,
    children: Array.from({ length: children, }, () => ({}),),
    remove() {
      this._removed = true;
      removed.push(this,);
    },
  };
}

/** app-root double recording insertBefore calls. */
function appRoot(contains: (h: any,) => boolean, moved: { h: any; ref: any }[],): any {
  return {
    _id: "app-root",
    children: [],
    contains,
    parentElement: {
      insertBefore(h: any, ref: any,) {
        moved.push({ h, ref, },);
      },
    },
  };
}

/** querySelectorAll that no longer returns removed slots, like a real DOM. */
function liveSlots(live: any[],): (sel: string,) => any[] {
  return (sel: string,) => (sel === "#header-slot" ? live.filter((s: any,) => !s._removed) : []);
}

describe("normalizeHeaderSlot — multi-slot resolution", () => {
  test("moves the last remaining slot before app-root after empties are removed", () => {
    const removed: any[] = [];
    const empty = slot(0, removed,);
    const full = slot(1, removed,);
    const live = [empty, full,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot(() => true, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([empty,],);
    expect(moved,).toEqual([{ h: full, ref: root, },],);
  });

  test("keeps zero remaining slots without crashing", () => {
    const removed: any[] = [];
    const a = slot(0, removed,);
    const b = slot(0, removed,);
    const live = [a, b,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot(() => false, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([a, b,],);
    expect(moved,).toEqual([],);
  });

  test("keeps the slot with the most content and removes the rest", () => {
    const removed: any[] = [];
    const small = slot(1, removed,);
    const big = slot(3, removed,);
    const live = [small, big,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot(() => true, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([small,],);
    expect(moved,).toEqual([{ h: big, ref: root, },],);
  });

  test("keeps the first slot when in-app slots have equal content", () => {
    const removed: any[] = [];
    const first = slot(2, removed,);
    const second = slot(2, removed,);
    const live = [first, second,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot(() => true, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([second,],);
    expect(moved,).toEqual([{ h: first, ref: root, },],);
  });

  test("prefers the in-app slot even when an out-of-app slot has more children", () => {
    const removed: any[] = [];
    const inApp = slot(1, removed,);
    const outApp = slot(5, removed,);
    const live = [inApp, outApp,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot((h: any,) => h === inApp, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([outApp,],);
    expect(moved,).toEqual([{ h: inApp, ref: root, },],);
  });

  test("falls back to the out-of-app slot with the most content without moving it", () => {
    const removed: any[] = [];
    const small = slot(1, removed,);
    const big = slot(2, removed,);
    const live = [small, big,];
    const moved: { h: any; ref: any }[] = [];
    const root = appRoot(() => false, moved,);
    const doc = mockDoc({
      querySelectorAll: liveSlots(live,),
      querySelector: (sel: string,) => (sel === "#app-root" ? root : null),
    },);
    globalThis.document = doc as any;
    normalizeHeaderSlot();
    expect(removed,).toEqual([small,],);
    // Not in-app: kept in place, never relocated.
    expect(moved,).toEqual([],);
  });
});
