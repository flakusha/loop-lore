// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure-logic tests for the info-bubble Alpine component (TASK-info-bubbles):
 * placement coercion, hover-mode gating, and the state machine's open/close
 * transitions. No I/O — `t()` resolves from the real en catalog installed by
 * the test helper, matchMedia is stubbed so the reduced-motion / fine-pointer
 * branches are deterministic.
 */
import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { infoBubble, normalizePlacement, shouldHover, } from "./info-bubble";

import type { InfoBubbleState, } from "./info-bubble";

type Globals = Record<string, unknown>;

const globals = globalThis as unknown as Globals;
const originalMatchMedia = globals.matchMedia;

let hoverCapable = false;
let reducedMotion = false;

/** Mount + init (Alpine calls init automatically on x-data). */
function mount(opts?: Parameters<typeof infoBubble>[0],): InfoBubbleState {
  const state = infoBubble(opts,);
  state.init();
  return state;
}

beforeEach(() => {
  hoverCapable = false;
  reducedMotion = false;
  globals.matchMedia = (query: string,): { matches: boolean } => ({
    matches: query.includes("(hover: hover)",) ? hoverCapable : query.includes("reduce",) && reducedMotion,
  });
},);

afterEach(() => {
  globals.matchMedia = originalMatchMedia;
},);

// ── normalizePlacement ─────────────────────────────────────────────────

describe("normalizePlacement", () => {
  test("passes every known placement through unchanged", () => {
    for (const placement of ["top", "right", "bottom", "left",] as const) {
      expect(normalizePlacement(placement,),).toBe(placement,);
    }
  });

  test("falls back to top for unknown values", () => {
    expect(normalizePlacement("diagonal",),).toBe("top",);
    expect(normalizePlacement("",),).toBe("top",);
    expect(normalizePlacement(undefined,),).toBe("top",);
    expect(normalizePlacement(7,),).toBe("top",);
  });
});

// ── shouldHover ────────────────────────────────────────────────────────

describe("shouldHover", () => {
  test("hover mode always opens on hover, whatever the pointer", () => {
    expect(shouldHover("hover", true,),).toBe(true,);
    expect(shouldHover("hover", false,),).toBe(true,);
  });

  test("click mode never opens on hover", () => {
    expect(shouldHover("click", true,),).toBe(false,);
    expect(shouldHover("click", false,),).toBe(false,);
  });

  test("auto mode follows fine-pointer detection", () => {
    expect(shouldHover("auto", true,),).toBe(true,);
    expect(shouldHover("auto", false,),).toBe(false,);
  });
});

// ── infoBubble state ───────────────────────────────────────────────────

describe("infoBubble", () => {
  test('registers itself on globalThis for x-data="infoBubble()"', () => {
    expect(globals.infoBubble,).toBe(infoBubble,);
  });

  test("defaults: auto mode, closed, no help key, animation on", () => {
    const state = mount();
    expect(state.helpKey,).toBe("",);
    expect(state.mode,).toBe("auto",);
    expect(state.placement,).toBe("top",);
    expect(state.open,).toBe(false,);
    expect(state.animate,).toBe(true,);
  });

  test("init assigns a unique tooltip id per instance", () => {
    const first = mount();
    const second = mount();
    expect(first.bubbleId,).toMatch(/^info-bubble-\d+$/,);
    expect(second.bubbleId,).toMatch(/^info-bubble-\d+$/,);
    expect(first.bubbleId,).not.toBe(second.bubbleId,);
  });

  test("init gates animation on prefers-reduced-motion", () => {
    reducedMotion = true;
    expect(mount().animate,).toBe(false,);
    reducedMotion = false;
    expect(mount().animate,).toBe(true,);
  });

  test("text() resolves the help key, and empty key renders nothing", () => {
    const state = mount({ helpKey: "help.settings.theme", },);
    expect(state.text(),).toBe("Choose a color scheme. Changes apply immediately.",);

    const noKey = mount();
    expect(noKey.text(),).toBe("",);
  });

  test("text() falls back to the raw key when the catalog has no entry", () => {
    expect(mount({ helpKey: "help.settings.nope", },).text(),).toBe("help.settings.nope",);
  });

  test("label() names the (?) trigger for assistive tech", () => {
    expect(mount().label(),).toBe("Help",);
  });

  test("popoverClass() encodes the normalized placement", () => {
    expect(mount({ placement: "right", },).popoverClass(),).toBe("info-bubble-right",);
    expect(mount({ placement: "bogus" as never, },).popoverClass(),).toBe("info-bubble-top",);
  });

  test("show/hide/toggle drive the open flag", () => {
    const state = mount();
    state.show();
    expect(state.open,).toBe(true,);
    state.hide();
    expect(state.open,).toBe(false,);

    state.toggle();
    expect(state.open,).toBe(true,);
    state.toggle();
    expect(state.open,).toBe(false,);
  });

  test("hover mode opens on enter and closes on leave", () => {
    const state = mount({ mode: "hover", },);
    state.onEnter();
    expect(state.open,).toBe(true,);
    state.onLeave();
    expect(state.open,).toBe(false,);
  });

  test("click mode ignores hover entirely", () => {
    const state = mount({ mode: "click", },);
    state.onEnter();
    expect(state.open,).toBe(false,);
    state.onLeave();
    expect(state.open,).toBe(false,);
  });

  test("auto mode opens on hover only for fine pointers", () => {
    hoverCapable = true;
    const fine = mount({ mode: "auto", },);
    fine.onEnter();
    expect(fine.open,).toBe(true,);
    fine.onLeave();
    expect(fine.open,).toBe(false,);

    hoverCapable = false;
    const coarse = mount({ mode: "auto", },);
    coarse.onEnter();
    expect(coarse.open,).toBe(false,);
  });

  test("focus opens and blur closes regardless of mode", () => {
    for (const mode of ["hover", "click", "auto",] as const) {
      const state = mount({ mode, },);
      state.onFocus();
      expect(state.open,).toBe(true,);
      state.onBlur();
      expect(state.open,).toBe(false,);
    }
  });

  test("a throwing matchMedia degrades to no-hover and keeps animation on", () => {
    globals.matchMedia = (): never => {
      throw new Error("matchMedia unavailable",);
    };

    const auto = mount({ mode: "auto", },);
    auto.onEnter();
    expect(auto.open,).toBe(false,);
    expect(auto.animate,).toBe(true,);

    // hover mode never consults the pointer, so it survives the same failure.
    const hover = mount({ mode: "hover", },);
    hover.onEnter();
    expect(hover.open,).toBe(true,);
  });

  test("a missing matchMedia degrades the same way", () => {
    globals.matchMedia = undefined;

    const state = mount({ mode: "auto", },);
    state.onEnter();
    expect(state.open,).toBe(false,);
    expect(state.animate,).toBe(true,);
  });
});
