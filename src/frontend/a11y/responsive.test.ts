// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure-logic tests for the input-mode tracker (a11y/responsive.ts):
 * snapshot construction from media queries, pointerdown class switching,
 * change notifications, and stop() teardown. No DOM — matchMedia, the
 * pointerdown source and the class target are deterministic fakes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createInputModeTracker, HOVER_QUERY, REDUCED_MOTION_QUERY, } from "./responsive";

import type { PointerEventSource, } from "./responsive";

type Globals = Record<string, unknown>;

const globals = globalThis as unknown as Globals;
const originalMatchMedia = globals.matchMedia;

interface FakeQuery {
  matches: boolean;
  listeners: Set<(event: { matches: boolean },) => void>;
}

const queries = new Map<string, FakeQuery>([
  [HOVER_QUERY, { matches: false, listeners: new Set(), },],
  [REDUCED_MOTION_QUERY, { matches: false, listeners: new Set(), },],
],);

function installMatchMedia(): void {
  globals.matchMedia = (query: string,): MediaQueryList => {
    const state = queries.get(query,);
    return {
      matches: state?.matches ?? false,
      addEventListener: (_type: string, listener: (event: { matches: boolean },) => void,) => {
        state?.listeners.add(listener,);
      },
      removeEventListener: (_type: string, listener: (event: { matches: boolean },) => void,) => {
        state?.listeners.delete(listener,);
      },
    } as unknown as MediaQueryList;
  };
}

/** Dispatch a pointerdown at every registered listener. */
function firePointerDown(pointerEvents: { listeners: Set<(event: Event,) => void> }, pointerType: string,): void {
  const event = { pointerType, } as unknown as Event;
  pointerEvents.listeners.forEach((listener,) => listener(event,));
}

function createFakeEvents(): {
  listeners: Set<(event: Event,) => void>;
  addEventListener: PointerEventSource["addEventListener"];
  removeEventListener: PointerEventSource["removeEventListener"];
} {
  const listeners = new Set<(event: Event,) => void>();
  return {
    listeners,
    addEventListener: (_type, listener,) => {
      listeners.add(listener,);
    },
    removeEventListener: (_type, listener,) => {
      listeners.delete(listener,);
    },
  };
}

function createFakeTarget(): {
  classList: { toggle: (token: string, force?: boolean,) => void; remove: (...tokens: string[]) => void };
  has: (token: string,) => boolean;
} {
  const classes = new Map<string, boolean>();
  return {
    classList: {
      toggle: (token, force,) => {
        classes.set(token, force ?? !(classes.get(token,) ?? false),);
      },
      remove: (...tokens) => {
        tokens.forEach((token,) => classes.delete(token,));
      },
    },
    has: (token,) => classes.get(token,) ?? false,
  };
}

beforeEach(() => {
  queries.forEach((state,) => {
    state.matches = false;
    state.listeners.clear();
  },);

  installMatchMedia();
},);

afterEach(() => {
  globals.matchMedia = originalMatchMedia;
},);

// ── snapshot construction ──────────────────────────────────────────────

describe("createInputModeTracker", () => {
  test("snapshot reflects media queries at creation", () => {
    queries.get(HOVER_QUERY,)!.matches = true;
    const tracker = createInputModeTracker();
    expect(tracker.current(),).toEqual({ pointer: null, hoverCapable: true, reducedMotion: false, },);
    tracker.stop();
  });

  test("a missing matchMedia degrades to a static snapshot", () => {
    globals.matchMedia = undefined;
    const tracker = createInputModeTracker();
    expect(tracker.current(),).toEqual({ pointer: null, hoverCapable: false, reducedMotion: false, },);
    tracker.stop();
  });

  test("a throwing matchMedia degrades the same way", () => {
    globals.matchMedia = (): never => {
      throw new Error("matchMedia unavailable",);
    };

    const tracker = createInputModeTracker();
    expect(tracker.current().hoverCapable,).toBe(false,);
    tracker.stop();
  });

  // ── pointer tracking ─────────────────────────────────────────────────

  test("pointerdown records the pointer kind and toggles classes", () => {
    const events = createFakeEvents();
    const target = createFakeTarget();
    const seen: string[] = [];
    const tracker = createInputModeTracker({ target, events, onChange: (s,) => seen.push(s.pointer ?? "",), },);

    firePointerDown(events, "touch",);
    expect(tracker.current().pointer,).toBe("touch",);
    expect(target.has("touch-user",),).toBe(true,);
    expect(target.has("mouse-user",),).toBe(false,);

    firePointerDown(events, "mouse",);
    expect(tracker.current().pointer,).toBe("mouse",);
    expect(target.has("touch-user",),).toBe(false,);
    expect(target.has("mouse-user",),).toBe(true,);
    expect(seen,).toEqual(["touch", "mouse",],);
    tracker.stop();
  });

  test("pen input counts as touch", () => {
    const events = createFakeEvents();
    const target = createFakeTarget();
    const tracker = createInputModeTracker({ target, events, },);
    firePointerDown(events, "pen",);
    expect(target.has("touch-user",),).toBe(true,);
    tracker.stop();
  });

  test("unknown pointer types are ignored", () => {
    const events = createFakeEvents();
    const target = createFakeTarget();
    const tracker = createInputModeTracker({ target, events, },);
    firePointerDown(events, "",);
    expect(tracker.current().pointer,).toBeNull();
    expect(target.has("touch-user",),).toBe(false,);
    expect(target.has("mouse-user",),).toBe(false,);
    tracker.stop();
  });

  // ── media query changes ──────────────────────────────────────────────

  test("media query changes update the snapshot and notify", () => {
    const changes: boolean[] = [];
    const tracker = createInputModeTracker({ onChange: (s,) => changes.push(s.reducedMotion,), },);
    const state = queries.get(REDUCED_MOTION_QUERY,)!;
    state.matches = true;
    state.listeners.forEach((listener,) => listener({ matches: true, },));
    expect(tracker.current().reducedMotion,).toBe(true,);
    expect(changes.at(-1,),).toBe(true,);
    tracker.stop();
  });

  // ── teardown ─────────────────────────────────────────────────────────

  test("stop detaches listeners and clears classes", () => {
    const events = createFakeEvents();
    const target = createFakeTarget();
    const tracker = createInputModeTracker({ target, events, },);
    firePointerDown(events, "touch",);
    tracker.stop();

    expect(target.has("touch-user",),).toBe(false,);
    expect(target.has("mouse-user",),).toBe(false,);

    firePointerDown(events, "mouse",);
    const state = queries.get(REDUCED_MOTION_QUERY,)!;
    state.matches = true;
    state.listeners.forEach((listener,) => listener({ matches: true, },));

    expect(tracker.current(),).toEqual({ pointer: "touch", hoverCapable: false, reducedMotion: false, },);
  });
});
