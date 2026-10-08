// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared text-toolbar factory — enhance/undo/preview against a host
 * textarea resolved by CSS selector; missing targets disable silently.
 */
import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { textToolbar, } from "./text-toolbar";

import type { ApiFetchMock, } from "../tests/test-types";

const globals = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  document: { querySelector: (sel: string,) => unknown };
};

const originalFetch = globals.apiFetch;
const originalQuerySelector = globals.document.querySelector;

interface FakeTextarea {
  value: string;
  style: Record<string, string>;
  dispatchEvent: (event: Event,) => boolean;
}

let textarea: FakeTextarea;
let dispatched: { event: string; detail: unknown }[];
let inputEvents: string[];

/** Minimal textarea twin for the selector-resolved target. */
function makeTextarea(value: string,): FakeTextarea {
  return {
    value,
    style: {},
    dispatchEvent: (event,) => {
      inputEvents.push(event.type,);
      return true;
    },
  };
}

beforeEach(() => {
  textarea = makeTextarea("rough draft",);
  dispatched = [];
  inputEvents = [];
  globals.document.querySelector = (sel: string,) => sel === "#tt-test" ? textarea : null;

  globals.apiFetch = () => Promise.resolve(Response.json({ data: { content: "polished", }, },),);
},);

afterEach(() => {
  globals.apiFetch = originalFetch;
  globals.document.querySelector = originalQuerySelector;
},);

function mount(target = "#tt-test",) {
  const toolbar = textToolbar({ target, },);
  toolbar.$dispatch = (event, detail,) => {
    dispatched.push({ event, detail, },);
  };

  toolbar.init();
  return toolbar;
}

describe("textToolbar", () => {
  test("enhance replaces the value and bumps undoDepth", async () => {
    const toolbar = mount();
    await toolbar.enhance("wording",);

    expect(textarea.value,).toBe("polished",);
    expect(toolbar.undoDepth,).toBe(1,);
    // x-model surfaces only sync on a real input event.
    expect(inputEvents,).toEqual(["input",],);
    expect(dispatched.at(-1,),).toEqual({
      event: "show-toast",
      detail: { type: "success", message: "Prompt improved", },
    },);
  });

  test("undo restores the previous value", async () => {
    const toolbar = mount();
    await toolbar.enhance("wording",);
    toolbar.undo();

    expect(textarea.value,).toBe("rough draft",);
    expect(toolbar.undoDepth,).toBe(0,);
  });

  test("togglePreview snapshots the current text as html", () => {
    const toolbar = mount();
    toolbar.togglePreview();

    expect(toolbar.showPreview,).toBe(true,);
    expect(toolbar.previewHtml,).toBe("rough draft",);
  });

  test("missing target disables without throwing", async () => {
    const toolbar = mount("#tt-missing",);
    expect(toolbar.disabled,).toBe(true,);

    let threw = false;
    try {
      toolbar.togglePreview();
      await toolbar.enhance("wording",);
    } catch {
      threw = true;
    }

    expect(threw,).toBe(false,);
    expect(textarea.value,).toBe("rough draft",);
  });
});
