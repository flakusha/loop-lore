// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the vnQaActions half of chat-settings/vn.ts — the production
 * caller that feeds the live renderer scenes into runQaCheck and mounts the
 * report through renderQaReport.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { state, } from "../../vn/scene-renderer/state";
import type { VnScene, } from "../../vn/scene-renderer/types";
import { vnQaActions, } from "./vn";

/** Minimal scene fixture. */
function scene(overrides: Partial<VnScene> = {},): VnScene {
  return {
    messageId: "m1",
    characterName: "Mira",
    text: "Well met.",
    role: "assistant",
    backgroundUrl: "bg.png",
    ...overrides,
  };
}

/** Element with the append/replaceChildren surface renderQaReport needs. */
interface FakeQaEl {
  className: string;
  textContent: string;
  children: unknown[];
  append(...els: unknown[]): void;
  replaceChildren(): void;
}

function fakeEl(): FakeQaEl {
  return {
    className: "",
    textContent: "",
    children: [],
    append(...els: unknown[]) {
      this.children.push(...els,);
    },
    replaceChildren() {
      this.children = [];
    },
  };
}

/** Narrow mutable view of the global document stub (setup-globals.ts). */
type MutableDocument = { querySelector: unknown; createElement: unknown };

const g = globalThis as { document: MutableDocument };
const originalQuerySelector = g.document.querySelector;
const originalCreateElement = g.document.createElement;

let reportContainer: FakeQaEl | null;

beforeEach(() => {
  state.scenes = [];
  vnQaActions._vnQaReport = null;
  vnQaActions._vnQaError = "";
  reportContainer = null;

  g.document.querySelector = (selector: string,) =>
    selector === '[data-testid="vn-qa-report"]' && reportContainer ? reportContainer : null;

  g.document.createElement = () => fakeEl();
},);

afterEach(() => {
  state.scenes = [];
  g.document.querySelector = originalQuerySelector;
  g.document.createElement = originalCreateElement;
},);

describe("vnQaActions.runVnQaCheck", () => {
  test("no rendered scenes: error set, no report, no render", () => {
    vnQaActions.runVnQaCheck();

    expect(vnQaActions._vnQaError,).toContain("No VN scenes",);
    expect(vnQaActions._vnQaReport,).toBeNull();
  });

  test("maps live scenes into the QA validator and stores the report", () => {
    state.scenes = [
      scene({},),
      scene({ messageId: "m2", text: "", },),
    ];

    vnQaActions.runVnQaCheck();

    expect(vnQaActions._vnQaError,).toBe("",);
    expect(vnQaActions._vnQaReport?.totalScenes,).toBe(2,);
    expect(vnQaActions._vnQaReport?.passed,).toBe(false,);
    expect(
      vnQaActions._vnQaReport?.issues.some((issue,) => issue.severity === "error" && issue.sceneIndex === 1),
    ).toBe(true,);
  });

  test("renders the report into the modal container when present", () => {
    reportContainer = fakeEl();
    state.scenes = [scene({},),];

    vnQaActions.runVnQaCheck();

    // replaceChildren cleared, then header + pass banner + issue list appended.
    expect(reportContainer.children.length,).toBeGreaterThan(0,);
  });

  test("a previous error is cleared by a successful run", () => {
    vnQaActions.runVnQaCheck();
    expect(vnQaActions._vnQaError,).not.toBe("",);

    state.scenes = [scene({},),];
    vnQaActions.runVnQaCheck();
    expect(vnQaActions._vnQaError,).toBe("",);
  });
});
