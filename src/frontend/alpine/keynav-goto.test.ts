// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * App-global keynav `goto-*` consumers (epic-accessibility-input Phase 3).
 *
 * The consumers are driven through dispatchKeynavActionToHandlers — the entry
 * point the document keydown listener uses (shortcuts-listener.test.ts covers
 * the g-pair → action mapping and the opt-in flag gate).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { registerGotoKeynavHandlers, } from "./keynav-goto";
import { __resetKeynavHandlersForTests, dispatchKeynavActionToHandlers, } from "./shortcuts";

/** Nav controls the fake DOM exposes. */
const NAV_CONTROLS = ["nav-chat", "nav-personas", "nav-characters", "nav-settings", "nav-gallery",];

let clicked: string[] = [];
let assigned: string[] = [];

beforeEach(() => {
  clicked = [];
  assigned = [];
  (globalThis as { location?: unknown }).location = {
    assign: (url: string,) => {
      assigned.push(url,);
    },
  };

  (document as { querySelector: unknown }).querySelector = (selector: string,) => {
    const testId = selector.replace('[data-testid="', "",).replace('"]', "",);
    if (!NAV_CONTROLS.includes(testId,)) { return null; }

    return {
      click: () => {
        clicked.push(testId,);
      },
    } as unknown as Element;
  };
},);

afterEach(() => {
  __resetKeynavHandlersForTests();
  (document as { querySelector: unknown }).querySelector = () => null;
},);

describe("goto keynav consumers", () => {
  it("goto-personas clicks the personas nav control", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-personas",);

    expect(clicked,).toEqual(["nav-personas",],);
  });

  it("goto-chatlist clicks the chat list nav control", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-chatlist",);

    expect(clicked,).toEqual(["nav-chat",],);
  });

  it("goto-characters clicks the characters nav control", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-characters",);

    expect(clicked,).toEqual(["nav-characters",],);
  });

  it("goto-gallery clicks the gallery nav control", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-gallery",);

    expect(clicked,).toEqual(["nav-gallery",],);
  });

  it("goto-settings clicks the settings nav control", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-settings",);

    expect(clicked,).toEqual(["nav-settings",],);
  });

  it("goto-home navigates to the app root", () => {
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-home",);

    expect(assigned,).toEqual(["/",],);
    expect(clicked,).toEqual([],);
  });

  it("teardown removes every consumer", () => {
    const unregister = registerGotoKeynavHandlers();
    unregister();

    dispatchKeynavActionToHandlers("goto-personas",);
    dispatchKeynavActionToHandlers("goto-home",);

    expect(clicked,).toEqual([],);
    expect(assigned,).toEqual([],);
  });

  it("a missing nav control does not throw", () => {
    registerGotoKeynavHandlers();
    (document as { querySelector: unknown }).querySelector = () => null;

    expect(() => dispatchKeynavActionToHandlers("goto-personas",)).not.toThrow();
    expect(clicked,).toEqual([],);
  });

  it("a second registration replaces the first", () => {
    registerGotoKeynavHandlers();
    registerGotoKeynavHandlers();

    dispatchKeynavActionToHandlers("goto-personas",);

    expect(clicked,).toEqual(["nav-personas",],);
  });

  it("an action without a consumer does not throw", () => {
    expect(() => dispatchKeynavActionToHandlers("battle-slot-1",)).not.toThrow();
  });
});
