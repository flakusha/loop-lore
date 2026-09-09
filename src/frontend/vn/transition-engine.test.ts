// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/transition-engine.ts — scene transition styles.
 *
 * Elements are minimal fakes that record style writes and listeners; the
 * transitionend event is delivered by invoking the registered listener. The
 * engine only exposes its promise as a completion signal, so fallback-timeout
 * cases await it directly (short durations keep real timer waits minimal).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { transitionScene, type TransitionType, } from "./transition-engine";

// ── Global stubs ────────────────────────────────────────────────────────────

type Globals = Record<string, unknown>;
const originalMatchMedia = (globalThis as Globals).matchMedia;
let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  (globalThis as Globals).matchMedia = (query: string,): { matches: boolean } => ({
    matches: reducedMotion && query.includes("reduce",),
  });
},);

afterEach(() => {
  (globalThis as Globals).matchMedia = originalMatchMedia;
},);

// ── Fake element ────────────────────────────────────────────────────────────

interface FakeEl {
  tagName: string;
  className: string;
  style: {
    setProperty: (name: string, value: string,) => void;
    [prop: string]: string | ((name: string, value: string,) => void);
  };
  offsetHeight: number;
  listeners: Map<string, Array<(e: unknown,) => void>>;
  addEventListener: (type: string, fn: (e: unknown,) => void,) => void;
  removeEventListener: (type: string, fn: (e: unknown,) => void,) => void;
  dispatch: (type: string,) => void;
}

function makeEl(): FakeEl {
  const style: FakeEl["style"] = {
    setProperty(name, value,) {
      style[name] = value;
    },
  };
  const listeners = new Map<string, Array<(e: unknown,) => void>>();
  return {
    tagName: "DIV",
    className: "",
    style,
    offsetHeight: 0,
    listeners,
    addEventListener(type, fn,) {
      listeners.set(type, [...(listeners.get(type,) ?? []), fn,],);
    },
    removeEventListener(type, fn,) {
      listeners.set(type, (listeners.get(type,) ?? []).filter((l,) => l !== fn),);
    },
    dispatch(type,) {
      for (const fn of [...(listeners.get(type,) ?? []),]) { fn({},); }
    },
  };
}

function asHtmlEl(el: FakeEl,): HTMLElement {
  return el as unknown as HTMLElement;
}

/** Start a transition and finish it by firing transitionend on the incoming el. */
function completeOnTransitionEnd(outgoing: FakeEl | null, incoming: FakeEl, type: TransitionType,): Promise<void> {
  const pending = transitionScene(outgoing === null ? null : asHtmlEl(outgoing,), asHtmlEl(incoming,), {
    type,
    duration: 20,
  },);
  incoming.dispatch("transitionend",);
  return pending;
}

// ── Instant paths ───────────────────────────────────────────────────────────

describe("transitionScene instant swap", () => {
  test("cut hides outgoing and reveals incoming without transitions", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await transitionScene(asHtmlEl(outgoing,), asHtmlEl(incoming,), { type: "cut", },);

    expect(outgoing.style.display,).toBe("none",);
    expect(incoming.style.display,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
    expect(incoming.style.transform,).toBe("",);
  });

  test("duration 0 resolves instantly even for animated types", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await transitionScene(asHtmlEl(outgoing,), asHtmlEl(incoming,), { type: "fade", duration: 0, },);

    expect(outgoing.style.display,).toBe("none",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("prefers-reduced-motion falls back to instant swap", async () => {
    reducedMotion = true;
    const outgoing = makeEl();
    const incoming = makeEl();

    await transitionScene(asHtmlEl(outgoing,), asHtmlEl(incoming,), { type: "slide", duration: 20, },);

    expect(outgoing.style.display,).toBe("none",);
    expect(incoming.style.opacity,).toBe("1",);
    expect(incoming.style.transform,).toBe("",);
  });

  test("null outgoing swaps the incoming element alone", async () => {
    const incoming = makeEl();

    await transitionScene(null, asHtmlEl(incoming,), { type: "cut", },);

    expect(incoming.style.opacity,).toBe("1",);
  });
});

// ── Animated paths ──────────────────────────────────────────────────────────

describe("transitionScene animated", () => {
  test("fade sets opacity transitions and cleans up on transitionend", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await completeOnTransitionEnd(outgoing, incoming, "fade",);

    expect(outgoing.style.display,).toBe("none",);
    expect(outgoing.style.transition,).toBe("",);
    expect(outgoing.style.opacity,).toBe("0",);
    expect(incoming.style.transition,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("fade without outgoing still completes", async () => {
    const incoming = makeEl();

    const pending = transitionScene(null, asHtmlEl(incoming,), { type: "fade", duration: 20, },);
    incoming.dispatch("transitionend",);
    await pending;

    expect(incoming.style.transition,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("slide translates outgoing left and incoming into place", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await completeOnTransitionEnd(outgoing, incoming, "slide",);

    expect(outgoing.style.transform,).toBe("",);
    expect(outgoing.style.opacity,).toBe("0",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("wipe clears the clip-path after revealing", async () => {
    const incoming = makeEl();

    await completeOnTransitionEnd(null, incoming, "wipe",);

    expect(incoming.style.clipPath,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("dissolve blurs both scenes then restores the incoming one", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await completeOnTransitionEnd(outgoing, incoming, "dissolve",);

    expect(outgoing.style.display,).toBe("none",);
    expect(outgoing.style.filter,).toBe("",);
    expect(incoming.style.filter,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("every animated type resolves via transitionend", async () => {
    for (const type of ["fade", "slide", "wipe", "dissolve",] as const) {
      const outgoing = makeEl();
      const incoming = makeEl();
      await completeOnTransitionEnd(outgoing, incoming, type,);
      expect(incoming.style.opacity,).toBe("1",);
    }
  });
});

// ── Fallback timeout ────────────────────────────────────────────────────────

describe("transitionScene fallback timeout", () => {
  test("resolves and cleans up when transitionend never fires", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await transitionScene(asHtmlEl(outgoing,), asHtmlEl(incoming,), { type: "fade", duration: 10, },);

    expect(outgoing.style.display,).toBe("none",);
    expect(incoming.style.transition,).toBe("",);
    expect(incoming.style.opacity,).toBe("1",);
  });

  test("late transitionend after the timeout is a harmless no-op", async () => {
    const outgoing = makeEl();
    const incoming = makeEl();

    await transitionScene(asHtmlEl(outgoing,), asHtmlEl(incoming,), { type: "fade", duration: 10, },);
    incoming.dispatch("transitionend",);

    expect(incoming.style.display,).toBe("",);
    expect(outgoing.style.display,).toBe("none",);
  });
});
