// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the chat list zoom (pinch-to-zoom target + keyboard shortcut).
 *
 * Bun has no DOM: the zoom target and the key scope are hand-rolled fakes
 * (focus.test.ts convention).
 */
import { describe, expect, test, } from "bun:test";
import {
  applyPinchZoom,
  applyZoom,
  beginPinchZoom,
  bindZoomKeys,
  clampZoom,
  endPinchZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  readZoom,
  resetZoom,
  ZOOM_STEP,
  type ZoomKeyEvent,
  type ZoomKeyScope,
  zoomStep,
  type ZoomTarget,
} from "./touch-zoom";

class FakeZoomTarget implements ZoomTarget {
  readonly props = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string,): void => {
      this.props.set(name, value,);
    },
    getPropertyValue: (name: string,): string => this.props.get(name,) ?? "",
  };
}

class FakeKeyScope implements ZoomKeyScope {
  activeElement: Element | null = null;
  private handler: ((event: ZoomKeyEvent,) => void) | null = null;

  addEventListener(type: "keydown", listener: (event: ZoomKeyEvent,) => void,): void {
    if (type === "keydown") { this.handler = listener; }
  }

  removeEventListener(type: "keydown", listener: (event: ZoomKeyEvent,) => void,): void {
    if (type === "keydown" && this.handler === listener) { this.handler = null; }
  }

  press(key: string, options: { ctrlKey?: boolean } = {},): void {
    this.handler?.({ key, ctrlKey: options.ctrlKey ?? false, preventDefault: () => {}, },);
  }
}

describe("clampZoom", () => {
  test("clamps at the upper and lower bound", () => {
    expect(clampZoom(4,),).toBe(2,);
    expect(clampZoom(0.2,),).toBe(1,);
  });

  test("keeps a factor inside the range", () => {
    expect(clampZoom(1.5,),).toBe(1.5,);
  });

  test("falls back to the minimum for a non-finite factor", () => {
    expect(clampZoom(Number.NaN,),).toBe(1,);
  });
});

describe("applyZoom", () => {
  test("writes the factor onto the element", () => {
    const target = new FakeZoomTarget();
    expect(applyZoom(target, 1.5,),).toBe(1.5,);
    expect(target.style.getPropertyValue("zoom",),).toBe("1.5",);
    expect(readZoom(target,),).toBe(1.5,);
  });

  test("clamps the written factor", () => {
    const target = new FakeZoomTarget();
    applyZoom(target, 7,);
    expect(target.style.getPropertyValue("zoom",),).toBe("2",);
  });

  test("reset returns the element to the unzoomed state", () => {
    const target = new FakeZoomTarget();
    applyZoom(target, 1.75,);
    resetZoom(target,);
    expect(target.style.getPropertyValue("zoom",),).toBe("1",);
  });

  test("a step zooms in and clamps at the bottom", () => {
    const target = new FakeZoomTarget();
    expect(zoomStep(target, 0.25,),).toBe(1.25,);
    expect(zoomStep(target, 0.25,),).toBe(1.5,);
    expect(zoomStep(target, -0.25,),).toBe(1.25,);
    expect(zoomStep(target, -5,),).toBe(1,);
  });
});

describe("pinch zoom", () => {
  test("scales the factor with the pinch", () => {
    const target = new FakeZoomTarget();
    beginPinchZoom(target,);
    expect(applyPinchZoom(target, 1.5,),).toBe(1.5,);
  });

  test("clamps at the upper bound", () => {
    const target = new FakeZoomTarget();
    beginPinchZoom(target,);
    expect(applyPinchZoom(target, 4,),).toBe(2,);
  });

  test("clamps at the lower bound", () => {
    const target = new FakeZoomTarget();
    beginPinchZoom(target,);
    expect(applyPinchZoom(target, 0.3,),).toBe(1,);
  });

  test("keeps the gesture's base factor across moves", () => {
    const target = new FakeZoomTarget();
    beginPinchZoom(target,);
    applyPinchZoom(target, 1.5,);
    // Same pinch, same scale again: the factor must not compound.
    expect(applyPinchZoom(target, 1.5,),).toBe(1.5,);
  });

  test("the next pinch starts from the current factor", () => {
    const target = new FakeZoomTarget();
    beginPinchZoom(target,);
    applyPinchZoom(target, 1.5,);
    endPinchZoom(target,);
    beginPinchZoom(target,);
    expect(applyPinchZoom(target, 1.2,),).toBeCloseTo(1.8,);
  });
});

describe("keyboard zoom", () => {
  test("Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets", () => {
    const target = new FakeZoomTarget();
    const scope = new FakeKeyScope();
    bindZoomKeys(scope, target,);

    scope.press("=", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1.25,);
    scope.press("=", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1.5,);
    scope.press("-", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1.25,);
    scope.press("0", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1,);
  });

  test("the bare keys work when no text field has focus", () => {
    const target = new FakeZoomTarget();
    const scope = new FakeKeyScope();
    bindZoomKeys(scope, target,);

    scope.press("=",);
    expect(readZoom(target,),).toBe(1.25,);
  });

  test("the bare keys are ignored while a text field has focus", () => {
    const target = new FakeZoomTarget();
    const scope = new FakeKeyScope();
    scope.activeElement = { tagName: "TEXTAREA", } as unknown as Element;
    bindZoomKeys(scope, target,);

    scope.press("=",);
    expect(readZoom(target,),).toBe(1,);
  });

  test("the modifier still zooms while a text field has focus", () => {
    const target = new FakeZoomTarget();
    const scope = new FakeKeyScope();
    scope.activeElement = { tagName: "TEXTAREA", } as unknown as Element;
    bindZoomKeys(scope, target,);

    scope.press("=", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1.25,);
  });

  test("the cleanup removes the listener", () => {
    const target = new FakeZoomTarget();
    const scope = new FakeKeyScope();
    const cleanup = bindZoomKeys(scope, target,);
    cleanup();

    scope.press("=", { ctrlKey: true, },);
    expect(readZoom(target,),).toBe(1,);
  });
});

describe("zoom bounds", () => {
  test("the documented bounds and step are used", () => {
    expect(MIN_ZOOM,).toBe(1,);
    expect(MAX_ZOOM,).toBe(2,);
    expect(ZOOM_STEP,).toBe(0.25,);
  });
});
