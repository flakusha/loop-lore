// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the chat touch-gesture wiring (epic-accessibility-input Phase 2).
 *
 * Bun has no window: the fake DOM below is hand-rolled (focus.test.ts
 * convention). The fake `closest` understands exactly the two selector shapes
 * the wiring module queries — `.message` rows and interactive controls.
 */
import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { chatTouchGestures, isTouchCapable, } from "./chat-touch-gestures";

type Listener = (event: unknown,) => void;

class FakeNode {
  readonly listeners = new Map<string, Listener[]>();
  readonly attrs: Record<string, string> = {};
  constructor(
    readonly parent: FakeNode | null,
    readonly flags: { message?: boolean; control?: boolean } = {},
  ) {}

  addEventListener(type: string, fn: Listener,): void {
    const list = this.listeners.get(type,) ?? [];
    list.push(fn,);
    this.listeners.set(type, list,);
  }

  removeEventListener(type: string, fn: Listener,): void {
    this.listeners.set(type, (this.listeners.get(type,) ?? []).filter((l,) => l !== fn),);
  }

  fire(type: string, event: Record<string, unknown>,): void {
    for (const fn of [...(this.listeners.get(type,) ?? []),]) {
      fn(event,);
    }
  }

  listenerCount(type: string,): number {
    return (this.listeners.get(type,) ?? []).length;
  }

  getAttribute(name: string,): string | null {
    return name in this.attrs ? this.attrs[name]! : null;
  }

  closest(selector: string,): FakeNode | null {
    if (selector === ".message") { return this.firstFlag("message",); }
    if (selector.includes("button",)) { return this.firstFlag("control",); }
    return null;
  }

  private firstFlag(flag: "message" | "control",): FakeNode | null {
    let node: FakeNode | null = this;
    while (node) {
      if (node.flags[flag]) { return node; }
      node = node.parent;
    }

    return null;
  }
}

interface ListFixture {
  list: FakeNode;
  /** Plain text leaf inside message row m1 (gesture-eligible). */
  leaf: FakeNode;
  /** Leaf inside a button inside message row m2 (carve-out target). */
  controlLeaf: FakeNode;
}

function makeMessageList(): ListFixture {
  const list = new FakeNode(null,);
  const row = new FakeNode(list, { message: true, },);
  row.attrs["data-message-id"] = "m1";
  const leaf = new FakeNode(row,);
  const controlRow = new FakeNode(list, { message: true, },);
  controlRow.attrs["data-message-id"] = "m2";
  const controlLeaf = new FakeNode(controlRow, { control: true, },);
  return { list, leaf, controlLeaf, };
}

function makeState(): {
  _touchSwipeTarget: Element | null;
  _touchOnControl: boolean;
  _touchGesturesEl: Element | null;
  _touchGesturesCleanups: (() => void)[];
  _archiveConfirmId: string | null;
  _archiveConfirmOpen: boolean;
  edits: string[];
  menus: { msgId: string; clientX: number; clientY: number }[];
  startEdit(msgId: string,): void;
  openContextMenu(event: { clientX: number; clientY: number }, msgId: string,): void;
  setupTouchGestures(): void;
  teardownTouchGestures(): void;
} {
  const state = {
    _archiveConfirmId: null as string | null,
    _archiveConfirmOpen: false,
    edits: [] as string[],
    menus: [] as { msgId: string; clientX: number; clientY: number }[],
    startEdit(msgId: string,): void {
      state.edits.push(msgId,);
    },
    openContextMenu(event: { clientX: number; clientY: number }, msgId: string,): void {
      state.menus.push({ msgId, clientX: event.clientX, clientY: event.clientY, },);
    },
  };

  return Object.assign(state, chatTouchGestures, {
    // Concrete re-declarations narrow the Partial's `| undefined` so the
    // declared return type holds after Object.assign.
    _touchSwipeTarget: null,
    _touchOnControl: false,
    _touchGesturesEl: null,
    _touchGesturesCleanups: [] as (() => void)[],
    setupTouchGestures: chatTouchGestures.setupTouchGestures!,
    teardownTouchGestures: chatTouchGestures.teardownTouchGestures!,
  },);
}

function touchStart(target: FakeNode | null, x: number, y: number,): Record<string, unknown> {
  const touch = { clientX: x, clientY: y, };
  return { target, touches: [touch,], changedTouches: [touch,], };
}

function swipeEvent(target: FakeNode | null, endX: number, endY: number,): Record<string, unknown> {
  return { target, changedTouches: [{ clientX: endX, clientY: endY, },], };
}

const g = globalThis as Record<string, unknown>;
const realDocument = globalThis.document;
const realMatchMedia = g.matchMedia;
let dom: ListFixture;
let currentList: FakeNode | null;

beforeEach(() => {
  dom = makeMessageList();
  currentList = dom.list;
  globalThis.document = {
    querySelector: (sel: string,) => sel === "#message-list" ? currentList : null,
  } as unknown as Document;

  g.ontouchstart = null; // touch events available → touch-capable
  delete g.matchMedia;
  vi.useRealTimers();
},);

afterEach(() => {
  vi.useRealTimers();
  globalThis.document = realDocument;
  delete g.ontouchstart;
  if (realMatchMedia === undefined) { delete g.matchMedia; }
  else { g.matchMedia = realMatchMedia; }
},);

describe("isTouchCapable", () => {
  test("true when touch events exist", () => {
    expect(isTouchCapable({ ontouchstart: null, },),).toBe(true,);
  });

  test("true when the primary pointer is coarse", () => {
    expect(isTouchCapable({ matchMedia: () => ({ matches: true, }), },),).toBe(true,);
  });

  test("false for pointer-fine desktops", () => {
    expect(isTouchCapable({ matchMedia: () => ({ matches: false, }), },),).toBe(false,);
  });

  test("false when neither signal exists", () => {
    expect(isTouchCapable({},),).toBe(false,);
  });

  test("false when matchMedia throws", () => {
    expect(isTouchCapable({
      matchMedia: () => {
        throw new Error("boom",);
      },
    },),).toBe(false,);
  });
});

describe("swipe gestures", () => {
  test("swipe left opens the archive dialog for the swiped message", () => {
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),); // dx = -80
    expect(state._archiveConfirmId,).toBe("m1",);
    expect(state._archiveConfirmOpen,).toBe(true,);
    expect(state.edits,).toEqual([],);
    expect(state.menus,).toEqual([],);
  });

  test("swipe right starts editing the swiped message", () => {
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 140, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 220, 300,),); // dx = +80
    expect(state.edits,).toEqual(["m1",],);
    expect(state._archiveConfirmOpen,).toBe(false,);
    expect(state._archiveConfirmId,).toBeNull();
  });

  test("sub-threshold travel dispatches nothing", () => {
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 200, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 230, 300,),); // dx = +30 < 60
    expect(state.edits,).toEqual([],);
    expect(state._archiveConfirmOpen,).toBe(false,);
  });

  test("vertical swipes dispatch nothing", () => {
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 200, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 200, 400,),); // dy = +100 → "down"
    dom.list.fire("touchstart", touchStart(dom.leaf, 200, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 200, 200,),); // dy = -100 → "up"
    expect(state.edits,).toEqual([],);
    expect(state._archiveConfirmOpen,).toBe(false,);
  });

  test("swipes starting on a button dispatch nothing (control carve-out)", () => {
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.controlLeaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.controlLeaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(false,);
    expect(state.edits,).toEqual([],);
  });

  test("re-setup is idempotent: one swipe dispatches exactly one action", () => {
    const state = makeState();
    state.setupTouchGestures();
    state.setupTouchGestures();
    // 3 = swipe-target tracker + onSwipe start + onLongPress start (not doubled).
    expect(dom.list.listenerCount("touchstart",),).toBe(3,);
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(true,);
  });

  test("reduced motion keeps gestures working (wiring performs no animation)", () => {
    g.matchMedia = () => ({ matches: true, }); // reduce + coarse
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(true,);
  });
});

describe("long-press gesture", () => {
  test("opens the context menu at the touch point via openContextMenu", () => {
    vi.useFakeTimers();
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 150, 250,),);
    vi.advanceTimersByTime(600,);
    expect(state.menus,).toEqual([{ msgId: "m1", clientX: 150, clientY: 250, },],);
    expect(state.edits,).toEqual([],);
    expect(state._archiveConfirmOpen,).toBe(false,);
  });

  test("does not open the menu when the touch starts on a button", () => {
    vi.useFakeTimers();
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.controlLeaf, 150, 250,),);
    vi.advanceTimersByTime(600,);
    expect(state.menus,).toEqual([],);
  });

  test("movement before the delay cancels the menu", () => {
    vi.useFakeTimers();
    const state = makeState();
    state.setupTouchGestures();
    dom.list.fire("touchstart", touchStart(dom.leaf, 150, 250,),);
    vi.advanceTimersByTime(200,);
    dom.list.fire("touchmove", touchStart(dom.leaf, 152, 251,),);
    vi.advanceTimersByTime(600,);
    expect(state.menus,).toEqual([],);
  });
});

describe("htmx swap lifecycle", () => {
  test("re-setup attaches to the fresh node and the removed node stops dispatching", () => {
    const state = makeState();
    state.setupTouchGestures();
    const removed = currentList!;

    // htmx swap: the live #message-list node is replaced and Alpine re-inits.
    dom = makeMessageList();
    currentList = dom.list;
    state.setupTouchGestures();
    expect(state._touchGesturesEl,).toBe(dom.list as unknown as Element,);

    // The removed node keeps no listeners → a late swipe dispatches nothing.
    removed.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    removed.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(false,);

    // The fresh node dispatches exactly once (no double dispatch).
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(true,);
  });

  test("teardown detaches every listener from the attached node", () => {
    const state = makeState();
    state.setupTouchGestures();
    expect(dom.list.listenerCount("touchstart",),).toBeGreaterThan(0,);
    state.teardownTouchGestures();
    expect(dom.list.listenerCount("touchstart",),).toBe(0,);
    expect(dom.list.listenerCount("touchend",),).toBe(0,);
    expect(dom.list.listenerCount("touchmove",),).toBe(0,);
    expect(dom.list.listenerCount("touchcancel",),).toBe(0,);
    expect(state._touchGesturesEl,).toBeNull();

    // Post-teardown gestures dispatch nothing.
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(false,);
  });
});

describe("attachment guards", () => {
  test("no listeners attach on desktop pointer-fine devices", () => {
    delete g.ontouchstart;
    g.matchMedia = () => ({ matches: false, }); // pointer: fine
    const state = makeState();
    state.setupTouchGestures();
    expect(state._touchGesturesEl,).toBeNull();
    expect(dom.list.listenerCount("touchstart",),).toBe(0,);
    // A stray synthetic swipe still dispatches nothing.
    dom.list.fire("touchstart", touchStart(dom.leaf, 220, 300,),);
    dom.list.fire("touchend", swipeEvent(dom.leaf, 140, 300,),);
    expect(state._archiveConfirmOpen,).toBe(false,);
  });

  test("attaches via pointer: coarse even without touch events", () => {
    delete g.ontouchstart;
    g.matchMedia = (query: string,) => ({ matches: query === "(pointer: coarse)", });
    const state = makeState();
    state.setupTouchGestures();
    expect(state._touchGesturesEl,).toBe(dom.list as unknown as Element,);
    expect(dom.list.listenerCount("touchstart",),).toBeGreaterThan(0,);
  });

  test("no-op when #message-list is absent", () => {
    currentList = null;
    const state = makeState();
    state.setupTouchGestures();
    expect(state._touchGesturesEl,).toBeNull();
    expect(state._touchGesturesCleanups,).toEqual([],);
  });
});
