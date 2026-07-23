/**
 * Focus management tests
 *
 * Note: DOM-dependent tests are skipped in Bun's non-DOM environment.
 * Run these in a browser or with jsdom.
 */

import { describe, expect, it, } from "bun:test";
import {
  focusFirst,
  getFirstFocusable,
  getLastFocusable,
  isInViewport,
  trapFocus,
} from "./focus";

describe("focus.ts exports", () => {
  it("exports getFirstFocusable as function", () => {
    expect(typeof getFirstFocusable,).toBe("function",);
  });

  it("exports getLastFocusable as function", () => {
    expect(typeof getLastFocusable,).toBe("function",);
  });

  it("exports trapFocus as function", () => {
    expect(typeof trapFocus,).toBe("function",);
  });

  it("exports focusFirst as function", () => {
    expect(typeof focusFirst,).toBe("function",);
  });

  it("exports isInViewport as function", () => {
    expect(typeof isInViewport,).toBe("function",);
  });
});

// DOM-dependent tests - only run in browser environment
if (typeof document !== "undefined" && typeof window !== "undefined") {
  describe("getFirstFocusable DOM tests", () => {
    it("returns first focusable element", () => {
      const container = document.createElement("div",);
      container.innerHTML = `
        <button id="btn1">First</button>
        <button id="btn2">Second</button>
      `;
      document.body.append(container,);

      const result = getFirstFocusable(container,);
      expect(result?.id,).toBe("btn1",);

      container.remove();
    });
  });

  describe("getLastFocusable DOM tests", () => {
    it("returns last focusable element", () => {
      const container = document.createElement("div",);
      container.innerHTML = `
        <button id="btn1">First</button>
        <button id="btn2">Last</button>
      `;
      document.body.append(container,);

      const result = getLastFocusable(container,);
      expect(result?.id,).toBe("btn2",);

      container.remove();
    });
  });

  describe("trapFocus DOM tests", () => {
    it("returns cleanup function", () => {
      const container = document.createElement("div",);
      container.innerHTML = '<button id="btn">Click</button>';
      document.body.append(container,);

      const cleanup = trapFocus(container,);
      expect(typeof cleanup,).toBe("function",);

      cleanup();
      container.remove();
    });
  });
}
