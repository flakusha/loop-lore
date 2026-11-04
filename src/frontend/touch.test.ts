// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the touch gesture utilities (onSwipe / onTap / onLongPress).
 *
 * Bun has no window: listeners are exercised against a hand-rolled fake
 * element that records addEventListener/removeEventListener types and replays
 * synthetic touch events (focus.test.ts convention).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { hapticFeedback, onLongPress, onPinch, onPull, onSwipe, onTap, } from "./touch";

type Listener = (event: unknown,) => void;

class FakeEl {
  readonly listeners = new Map<string, Listener[]>();
  /** Scroll offset of the fake scroll container (pull-to-refresh reads it). */
  scrollTop = 0;

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

/** Two-finger touch event (pinch). */
function twoTouchEvent(
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number,
): Record<string, unknown> {
  return {
    touches: [{ clientX: firstX, clientY: firstY, }, { clientX: secondX, clientY: secondY, },],
    changedTouches: [{ clientX: firstX, clientY: firstY, }, { clientX: secondX, clientY: secondY, },],
  };
}

const g = globalThis as Record<string, unknown>;
const realMatchMedia = g.matchMedia;
const realOntouchstart = g.ontouchstart;
const realNavigator = g.navigator;

afterEach(() => {
  if (realMatchMedia === undefined) { delete g.matchMedia; }
  else { g.matchMedia = realMatchMedia; }

  if (realOntouchstart === undefined) { delete g.ontouchstart; }
  else { g.ontouchstart = realOntouchstart; }

  g.navigator = realNavigator;
},);

describe("selectable-text carve-out", () => {
  const realGetSelection = g.getSelection;

  beforeEach(() => {
    // No selection by default - the blocked cases opt in explicitly.
    g.getSelection = () => ({ isCollapsed: true, toString: () => "", });
  },);

  afterEach(() => {
    if (realGetSelection === undefined) { delete g.getSelection; }
    else { g.getSelection = realGetSelection; }
  },);

  test("a swipe over a text selection does not fire", () => {
    const el = new FakeEl();
    let calls = 0;
    g.getSelection = () => ({ isCollapsed: false, toString: () => "selected", });
    onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 300, 300,),);
    el.fire("touchend", touchEvent(200, 140, 300, 310,),); // dx = -60
    expect(calls,).toBe(0,);
  });

  test("a pull over a text selection does not fire", () => {
    const el = new FakeEl();
    let calls = 0;
    g.getSelection = () => ({ isCollapsed: false, toString: () => "selected", });
    onPull(el as unknown as Element, {
      onPull: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 100, 100,),);
    el.fire("touchmove", touchEvent(200, 200, 200, 200,),); // dy = +100
    expect(calls,).toBe(0,);
  });

  test("a long press over a text selection does not fire", async () => {
    const el = new FakeEl();
    let calls = 0;
    g.getSelection = () => ({ isCollapsed: false, toString: () => "selected", });
    onLongPress(el as unknown as Element, {
      delay: 20,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 150, 250, 250,),);
    await new Promise((r,) => setTimeout(r, 40,));
    expect(calls,).toBe(0,);
  });

  test("a long press that starts a text selection does not fire", async () => {
    const el = new FakeEl();
    let calls = 0;
    onLongPress(el as unknown as Element, {
      delay: 20,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 150, 250, 250,),);
    // The press selects text: the selection appears while the press runs.
    g.getSelection = () => ({ isCollapsed: false, toString: () => "selected", });
    await new Promise((r,) => setTimeout(r, 40,));
    expect(calls,).toBe(0,);
  });
});

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

  test("a vertical drag does not fire a swipe", () => {
    const el = new FakeEl();
    const dirs: string[] = [];
    onSwipe(el as unknown as Element, {
      onSwipe: (direction,) => {
        dirs.push(direction,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 200, 200, 300,),); // dy=+100: scroll/pull
    el.fire("touchstart", touchEvent(200, 0,),);
    el.fire("touchend", touchEvent(200, 200, 200, 100,),); // dy=-100: scroll/pull
    expect(dirs,).toEqual([],);
  });

  test("cleanup removes the touch listeners", () => {
    const el = new FakeEl();
    let calls = 0;
    const cleanup = onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
    },);

    expect(el.registered(),).toEqual(["touchstart", "touchmove", "touchend", "touchcancel",],);
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

  test("does not fire once the pointer moved past the tolerance", async () => {
    const el = new FakeEl();
    let calls = 0;
    onLongPress(el as unknown as Element, {
      delay: 30,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 0,),);
    el.fire("touchmove", touchEvent(190, 0,),); // 40px of travel
    await new Promise((r,) => setTimeout(r, 60,));
    expect(calls,).toBe(0,);
  });

  test("still fires after a 1px jitter", async () => {
    const el = new FakeEl();
    let calls = 0;
    onLongPress(el as unknown as Element, {
      delay: 30,
      onLongPress: () => {
        calls += 1;
      },
    },);

    el.fire("touchstart", touchEvent(150, 0,),);
    el.fire("touchmove", touchEvent(151, 0,),); // 1px of travel
    await new Promise((r,) => setTimeout(r, 60,));
    expect(calls,).toBe(1,);
  });
});

describe("onPinch", () => {
  test("reports the scale ratio once the fingers spread", () => {
    const el = new FakeEl();
    const scales: number[] = [];
    onPinch(el as unknown as Element, {
      onPinch: (_e, scale,) => {
        scales.push(scale,);
      },
    },);

    el.fire("touchstart", twoTouchEvent(100, 100, 200, 100,),); // distance 100
    el.fire("touchmove", twoTouchEvent(100, 100, 300, 100,),); // distance 200
    expect(scales,).toEqual([2,],);
  });

  test("ignores a spread below the threshold", () => {
    const el = new FakeEl();
    const scales: number[] = [];
    onPinch(el as unknown as Element, {
      threshold: 0.5,
      onPinch: (_e, scale,) => {
        scales.push(scale,);
      },
    },);

    el.fire("touchstart", twoTouchEvent(100, 100, 200, 100,),);
    el.fire("touchmove", twoTouchEvent(100, 100, 220, 100,),); // scale 1.2
    expect(scales,).toEqual([],);
  });

  test("a pinch suppresses the swipe", () => {
    const el = new FakeEl();
    const swipes: string[] = [];
    onSwipe(el as unknown as Element, {
      onSwipe: (direction,) => {
        swipes.push(direction,);
      },
    },);

    onPinch(el as unknown as Element, {
      onPinch: () => {},
    },);

    el.fire("touchstart", twoTouchEvent(100, 100, 200, 100,),);
    el.fire("touchend", touchEvent(100, 300,),); // dx=+200, horizontal
    expect(swipes,).toEqual([],);
  });
});

describe("onPull", () => {
  test("fires above the threshold at the top of the list", () => {
    const el = new FakeEl();
    const pulls: number[] = [];
    onPull(el as unknown as Element, {
      onPull: (_e, distance,) => {
        pulls.push(distance,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 100,),); // start at y=100
    el.fire("touchmove", touchEvent(200, 200, 200,),); // dy=+100
    expect(pulls,).toEqual([100,],);
  });

  test("does not fire below the threshold", () => {
    const el = new FakeEl();
    const pulls: number[] = [];
    onPull(el as unknown as Element, {
      onPull: (_e, distance,) => {
        pulls.push(distance,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 100,),);
    el.fire("touchmove", touchEvent(200, 200, 150,),); // dy=+50
    expect(pulls,).toEqual([],);
  });

  test("does not fire while the list is scrolled", () => {
    const el = new FakeEl();
    el.scrollTop = 50;
    const pulls: number[] = [];
    onPull(el as unknown as Element, {
      onPull: (_e, distance,) => {
        pulls.push(distance,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 100,),);
    el.fire("touchmove", touchEvent(200, 200, 200,),); // dy=+100
    expect(pulls,).toEqual([],);
  });

  test("fires once per interaction", () => {
    const el = new FakeEl();
    const pulls: number[] = [];
    onPull(el as unknown as Element, {
      onPull: (_e, distance,) => {
        pulls.push(distance,);
      },
    },);

    el.fire("touchstart", touchEvent(200, 200, 100,),);
    el.fire("touchmove", touchEvent(200, 200, 200,),);
    el.fire("touchmove", touchEvent(200, 200, 250,),);
    expect(pulls,).toEqual([100,],);
  });

  test("claims the gesture as vertical, so the swipe stays silent", () => {
    const el = new FakeEl();
    const swipes: string[] = [];
    onSwipe(el as unknown as Element, {
      onSwipe: (direction,) => {
        swipes.push(direction,);
      },
    },);

    onPull(el as unknown as Element, {
      onPull: () => {},
    },);

    el.fire("touchstart", touchEvent(200, 200, 100,),);
    el.fire("touchmove", touchEvent(200, 200, 200,),); // dy=+100
    el.fire("touchend", touchEvent(400, 400, 200,),); // dx=+200, horizontal
    expect(swipes,).toEqual([],);
  });
});

describe("hapticFeedback", () => {
  test("is a no-op on devices without navigator.vibrate", () => {
    let probed = false;
    g.navigator = {
      get vibrate(): undefined {
        probed = true;
        return undefined;
      },
    };

    // Calling a missing vibrate would throw, so a clean call proves the
    // detector never invoked it.
    expect(() => {
      hapticFeedback("medium",);
    },).not.toThrow();

    expect(probed,).toBe(true,);
  });

  test("is a no-op under prefers-reduced-motion", () => {
    g.matchMedia = () => ({ matches: true, });
    const pulses: number[] = [];
    g.navigator = {
      vibrate: (pattern: number,) => {
        pulses.push(pattern,);
        return true;
      },
    };

    hapticFeedback("light",);
    expect(pulses,).toEqual([],);
  });

  test("vibrates with the duration of the requested strength", () => {
    g.matchMedia = () => ({ matches: false, });
    const pulses: number[] = [];
    g.navigator = {
      vibrate: (pattern: number,) => {
        pulses.push(pattern,);
        return true;
      },
    };

    hapticFeedback("light",);
    hapticFeedback("medium",);
    hapticFeedback("heavy",);
    expect(pulses,).toEqual([10, 20, 40,],);
  });
});

describe("gesture arbitration", () => {
  test("the new detectors only listen to touch events", () => {
    delete g.ontouchstart;
    const el = new FakeEl();
    let calls = 0;
    onSwipe(el as unknown as Element, {
      onSwipe: () => {
        calls += 1;
      },
    },);

    onPinch(el as unknown as Element, {
      onPinch: () => {
        calls += 1;
      },
    },);

    onPull(el as unknown as Element, {
      onPull: () => {
        calls += 1;
      },
    },);

    // A mouse-only device never triggers a touch listener.
    expect(el.registered(),).toEqual(["touchstart", "touchmove", "touchend", "touchcancel",],);
    expect(calls,).toBe(0,);
  });
});
