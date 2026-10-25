// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the touch gesture utilities (onSwipe / onTap / onLongPress).
 *
 * Bun has no window: listeners are exercised against a hand-rolled fake
 * element that records addEventListener/removeEventListener types and replays
 * synthetic touch events (focus.test.ts convention).
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { onLongPress, onSwipe, onTap, } from "./touch";

type Listener = (event: unknown,) => void;

class FakeEl {
  readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, fn: Listener,): void {
    const list = this.listeners.get(type,) ?? [];
    list.push(fn,);
    this.listeners.set(type, list,);
  }

  removeEventListener(type: string, fn: Listener,): void {
    this.listeners.set(type, (this.listeners.get(type,) ?? []).filter((l,) => l !== fn),);
  }

  registered(): string[] {
    return [...this.listeners.entries(),].filter(([, v,],) => v.length > 0).map(([k,],) => k);
  }

  fire(type: string, event: Record<string, unknown>,): void {
    for (const fn of [...(this.listeners.get(type,) ?? []),]) {
      fn(event,);
    }
  }
}

function touchEvent(startX: number, endX: number, startY = 200, endY = 200,): Record<string, unknown> {
  return {
    touches: [{ clientX: startX, clientY: startY, },],
    changedTouches: [{ clientX: endX, clientY: endY, },],
  };
}

const g = globalThis as Record<string, unknown>;
const realMatchMedia = g.matchMedia;
const realOntouchstart = g.ontouchstart;

afterEach(() => {
  if (realMatchMedia === undefined) { delete g.matchMedia; }
  else { g.matchMedia = realMatchMedia; }

  if (realOntouchstart === undefined) { delete g.ontouchstart; }
  else { g.ontouchstart = realOntouchstart; }
},);

describe("onSwipe", () => {
  test("fires with direction and delta past the threshold", () => {
    const el = new FakeEl();
    const seen: { direction: string; delta: { x: number; y: number } }[] = [];
    onSwipe(el as unknown as Element, {
      onSwipe: (direction, delta,) => {
        seen.push({ direction, delta, },);
      },
    },);

    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 140, 200, 210,),); // dx=-60, dy=+10
    expect(seen,).toEqual([{ direction: "left", delta: { x: -60, y: 10, }, },],);
  });

  test("ignores travel below the threshold", () => {
    const el = new FakeEl();
    let calls = 0;
    onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
      threshold: 50,
    },);

    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 230,),); // dx=+30 < 50
    expect(calls,).toBe(0,);
  });

  test("ignores gestures slower than maxDuration", async () => {
    const el = new FakeEl();
    let calls = 0;
    onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
      maxDuration: 5,
    },);

    el.fire("touchstart", touchEvent(200, 0,),);
    await new Promise((r,) => setTimeout(r, 15,));
    el.fire("touchend", touchEvent(200, 100,),);
    expect(calls,).toBe(0,);
  });

  test("reports vertical dominance as up/down", () => {
    const el = new FakeEl();
    const dirs: string[] = [];
    onSwipe(el as unknown as Element, {
      onSwipe: (direction,) => {
        dirs.push(direction,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 200, 200, 300,),); // dy=+100 → down
    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 200, 200, 100,),); // dy=-100 → up
    expect(dirs,).toEqual(["down", "up",],);
  });

  test("cleanup removes the touch listeners", () => {
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
    },);

    expect(el.registered(),).toEqual(["touchstart", "touchend",],);
    cleanup();
    expect(el.registered(),).toEqual([],);
    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 100,),);
    expect(calls,).toBe(0,);
  });
});

describe("onTap", () => {
  test("uses touchend on touch devices without reduced motion", () => {
    g.ontouchstart = null;
    g.matchMedia = () => ({ matches: false, });
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onTap(el as unknown as Element, {
      onTap: () => {
        calls += 1;
      },
    },);

    expect(el.registered(),).toEqual(["touchend",],);
    el.fire("touchend", {},);
    expect(calls,).toBe(1,);
    cleanup();
    expect(el.registered(),).toEqual([],);
  });

  test("degrades to click under prefers-reduced-motion (documented fallback)", () => {
    g.ontouchstart = null;
    g.matchMedia = () => ({ matches: true, }); // reduce
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onTap(el as unknown as Element, {
      onTap: () => {
        calls += 1;
      },
    },);

    expect(el.registered(),).toEqual(["click",],);
    el.fire("click", {},);
    expect(calls,).toBe(1,);
    cleanup();
    expect(el.registered(),).toEqual([],);
  });

  test("degrades to click on devices without touch at all", () => {
    delete g.ontouchstart;
    g.matchMedia = () => ({ matches: false, });
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onTap(el as unknown as Element, {
      onTap: () => {
        calls += 1;
      },
    },);

    expect(el.registered(),).toEqual(["click",],);
    el.fire("click", {},);
    expect(calls,).toBe(1,);
    cleanup();
  });
});

describe("onLongPress", () => {
  test("fires the callback once after the delay", async () => {
    const el = new FakeEl();
    const events: unknown[] = [];
    const cleanup = onLongPress(el as unknown as Element, {
      delay: 20,
      onLongPress: (e,) => {
        events.push(e,);
      },
    },);

    expect(el.registered(),).toEqual(["touchstart", "touchmove", "touchend", "touchcancel",],);
    const ev = touchEvent(150, 0,);
    el.fire("touchstart", ev,);
    await new Promise((r,) => setTimeout(r, 60,));
    expect(events,).toEqual([ev,],);
    cleanup();
  });

  test("touchend before the delay cancels the press", async () => {
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onLongPress(el as unknown as Element, {
      delay: 30,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 0,),);
    el.fire("touchend", {},);
    await new Promise((r,) => setTimeout(r, 60,));
    expect(calls,).toBe(0,);
    cleanup();
  });

  test("cleanup cancels a pending press and removes listeners", async () => {
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onLongPress(el as unknown as Element, {
      delay: 30,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 0,),);
    cleanup();
    expect(el.registered(),).toEqual([],);
    await new Promise((r,) => setTimeout(r, 60,));
    expect(calls,).toBe(0,);
  });
});
