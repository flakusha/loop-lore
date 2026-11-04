// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the shared touch gesture session (the arbitration layer).
 *
 * The session is keyed by element, so plain objects stand in for elements:
 * only identity matters, never DOM behaviour.
 */
import { describe, expect, test, } from "bun:test";
import {
  beginSession,
  claimOf,
  claimPinch,
  clearSession,
  hasTextSelection,
  isBlocked,
  markMoved,
  updateClaim,
} from "./touch-session";

describe("beginSession", () => {
  test("records the start point once per interaction", () => {
    const el = {} as Element;
    const first = beginSession(el, { clientX: 100, clientY: 200, },);
    expect(first.startX,).toBe(100,);
    expect(first.startY,).toBe(200,);

    // A later touchstart handler joins the same interaction.
    const second = beginSession(el, { clientX: 300, clientY: 400, },);
    expect(second,).toBe(first,);
    expect(second.startX,).toBe(100,);
    expect(second.startY,).toBe(200,);
  });

  test("a new interaction after clearSession starts fresh", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 100, clientY: 200, },);
    claimPinch(el,);
    clearSession(el,);

    const next = beginSession(el, { clientX: 10, clientY: 20, },);
    expect(next.startX,).toBe(10,);
    expect(next.startY,).toBe(20,);
    expect(next.claim,).toBe("none",);
    expect(next.moved,).toBe(false,);
  });
});

describe("updateClaim", () => {
  test("claims the dominant axis once past the threshold", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 0, clientY: 0, },);

    updateClaim(el, { dx: 80, dy: 10, threshold: 50, },);
    expect(claimOf(el,),).toBe("horizontal",);

    // The first claim wins: a later vertical drag cannot steal it.
    updateClaim(el, { dx: 0, dy: 200, threshold: 50, },);
    expect(claimOf(el,),).toBe("horizontal",);
  });

  test("claims vertical when the vertical axis dominates", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 0, clientY: 0, },);
    updateClaim(el, { dx: 10, dy: 80, threshold: 50, },);
    expect(claimOf(el,),).toBe("vertical",);
  });

  test("ignores movement below the threshold", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 0, clientY: 0, },);
    updateClaim(el, { dx: 10, dy: 10, threshold: 50, },);
    expect(claimOf(el,),).toBe("none",);
  });

  test("is a no-op without a session", () => {
    const el = {} as Element;
    updateClaim(el, { dx: 80, dy: 10, threshold: 50, },);
    expect(claimOf(el,),).toBe("none",);
  });
});

describe("claimPinch", () => {
  test("a pinch wins over every other claim", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 0, clientY: 0, },);
    updateClaim(el, { dx: 80, dy: 10, threshold: 50, },);
    claimPinch(el,);
    expect(claimOf(el,),).toBe("pinch",);
  });

  test("is a no-op without a session", () => {
    const el = {} as Element;
    claimPinch(el,);
    expect(claimOf(el,),).toBe("none",);
  });
});

describe("markMoved", () => {
  test("reports movement past the tolerance and records it", () => {
    const el = {} as Element;
    const session = beginSession(el, { clientX: 0, clientY: 0, },);

    expect(markMoved(el, { dx: 3, dy: 4, threshold: 10, },),).toBe(false,);
    expect(session.moved,).toBe(false,);

    expect(markMoved(el, { dx: 30, dy: 0, threshold: 10, },),).toBe(true,);
    expect(session.moved,).toBe(true,);
  });

  test("is a no-op without a session", () => {
    const el = {} as Element;
    expect(markMoved(el, { dx: 30, dy: 0, threshold: 10, },),).toBe(false,);
  });
});

describe("claimOf", () => {
  test("is none for an element without a session", () => {
    expect(claimOf({} as Element,),).toBe("none",);
  });
});

describe("clearSession", () => {
  test("ends the interaction but keeps the claim readable", () => {
    const el = {} as Element;
    beginSession(el, { clientX: 0, clientY: 0, },);
    updateClaim(el, { dx: 80, dy: 10, threshold: 50, },);

    clearSession(el,);
    expect(claimOf(el,),).toBe("horizontal",);
  });

  test("is a no-op without a session", () => {
    expect(() => {
      clearSession({} as Element,);
    },).not.toThrow();
  });
});

describe("hasTextSelection", () => {
  test("reports a non-collapsed selection", () => {
    expect(hasTextSelection({ getSelection: () => ({ isCollapsed: false, toString: () => "picked", }), },),).toBe(
      true,
    );

    // A non-collapsed selection counts even when its text is blank.
    expect(hasTextSelection({ getSelection: () => ({ isCollapsed: false, toString: () => "   ", }), },),).toBe(true,);
  });

  test("reports an empty, collapsed or absent selection as none", () => {
    expect(hasTextSelection({ getSelection: () => null, },),).toBe(false,);
    expect(hasTextSelection({ getSelection: () => ({ isCollapsed: true, toString: () => "", }), },),).toBe(false,);
    expect(hasTextSelection({},),).toBe(false,);
  });
});

describe("isBlocked", () => {
  test("is false for an element without a session", () => {
    expect(isBlocked({} as Element,),).toBe(false,);
  });

  test("mirrors the selection captured when the session started", () => {
    const element = {} as Element;

    // The selection source is injected, so the test owns no shared global.
    beginSession(element, {
      clientX: 0,
      clientY: 0,
      selection: { getSelection: () => ({ isCollapsed: false, toString: () => "picked", }), },
    },);

    expect(isBlocked(element,),).toBe(true,);
  });
});
