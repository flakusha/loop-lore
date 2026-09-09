// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { renderQaReport, runQaCheck, type VnQaReport, } from "./qa-mode";

interface QaScene {
  text: string;
  characterName: string;
  backgroundUrl?: string;
  role: string;
}

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  append: (...nodes: FakeElement[]) => void;
  replaceChildren: (...nodes: FakeElement[]) => void;
}

/** Minimal element tree covering everything renderQaReport touches. */
function makeElement(tag: string,): FakeElement {
  return {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    children: [],
    append(...nodes: FakeElement[]) {
      this.children.push(...nodes,);
    },
    replaceChildren(...nodes: FakeElement[]) {
      this.children = [...nodes,];
    },
  };
}

function installFakeDocument(): void {
  globalThis.document = {
    createElement: (tag: string,) => makeElement(tag,),
  } as unknown as Document;
}

function render(container: FakeElement, report: VnQaReport,): FakeElement[] {
  installFakeDocument();
  renderQaReport(report, container as unknown as HTMLElement,);
  return container.children;
}

function scene(overrides: Partial<QaScene> = {},): QaScene {
  return {
    text: "Hello there.",
    characterName: "Aria",
    backgroundUrl: "bg.png",
    role: "npc",
    ...overrides,
  };
}

describe("runQaCheck", () => {
  test("empty scene list passes with no issues", () => {
    const report = runQaCheck([],);
    expect(report.totalScenes,).toBe(0,);
    expect(report.issues,).toEqual([],);
    expect(report.passed,).toBe(true,);
  });

  test("a well-formed scene produces no issues and passes", () => {
    const report = runQaCheck([scene(),],);
    expect(report.issues,).toEqual([],);
    expect(report.passed,).toBe(true,);
    expect(report.totalScenes,).toBe(1,);
  });

  test("blank text is an error issue and fails the report", () => {
    const report = runQaCheck([scene({ text: "   ", },),],);
    const blank = report.issues.find((i,) => i.field === "text");
    expect(blank?.severity,).toBe("error",);
    expect(report.passed,).toBe(false,);
  });

  test("text over 2000 chars is a warning, not a failure", () => {
    const report = runQaCheck([scene({ text: "x".repeat(2001,), },),],);
    const long = report.issues.find((i,) => i.field === "text");
    expect(long?.severity,).toBe("warning",);
    expect(report.passed,).toBe(true,);
  });

  test("non-narration scene without a character name is a warning", () => {
    const report = runQaCheck([scene({ characterName: "", },),],);
    const missing = report.issues.find((i,) => i.field === "characterName");
    expect(missing?.severity,).toBe("warning",);
    expect(report.passed,).toBe(true,);
  });

  test("narration scene is exempt from the character-name check", () => {
    const report = runQaCheck([scene({ role: "narration", characterName: "", },),],);
    expect(report.issues.some((i,) => i.field === "characterName"),).toBe(false,);
  });

  test("missing background is an info issue only", () => {
    const report = runQaCheck([scene({ backgroundUrl: undefined, },),],);
    const noBackground = report.issues.find((i,) => i.field === "backgroundUrl");
    expect(noBackground?.severity,).toBe("info",);
    expect(report.passed,).toBe(true,);
  });

  test("issue sceneIndex reflects the scene's position", () => {
    const report = runQaCheck([scene(), scene({ text: "", },),],);
    expect(report.issues.every((i,) => i.sceneIndex === 1),).toBe(true,);
  });

  test("three consecutive narration scenes warn once at the third", () => {
    const narration = scene({ role: "narration", characterName: "", },);
    const report = runQaCheck([narration, narration, narration,],);
    const pacing = report.issues.filter((i,) => i.message.includes("consecutive narration",));
    expect(pacing.length,).toBe(1,);
    expect(pacing[0]?.sceneIndex,).toBe(2,);
  });

  test("narration counter resets after a dialogue scene", () => {
    const narration = scene({ role: "narration", characterName: "", },);
    const report = runQaCheck([narration, narration, scene(), narration, narration,],);
    expect(report.issues.filter((i,) => i.message.includes("consecutive narration",)).length,).toBe(0,);
  });

  test("four consecutive narrations warn once; the run counter restarts after", () => {
    const narration = scene({ role: "narration", characterName: "", },);
    const report = runQaCheck([narration, narration, narration, narration,],);
    const pacing = report.issues.filter((i,) => i.message.includes("consecutive narration",));
    expect(pacing.map((i,) => i.sceneIndex),).toEqual([2,],);
  });

  test("null scenes (JS callers) are skipped but still counted", () => {
    const scenes = [scene(), null, scene({ text: "", },),] as unknown as QaScene[];
    const report = runQaCheck(scenes,);
    expect(report.totalScenes,).toBe(3,);
    expect(report.issues.every((i,) => i.sceneIndex !== 1),).toBe(true,);
    expect(report.passed,).toBe(false,);
  });
});

describe("renderQaReport", () => {
  test("clears the container and renders header, pass marker, and issues", () => {
    const container = makeElement("div",);
    container.append(makeElement("span",),);
    const report = runQaCheck([
      scene({ characterName: "", backgroundUrl: undefined, },),
    ],);
    expect(report.passed,).toBe(true,);

    const children = render(container, report,);
    expect(children.some((el,) => el.tagName === "SPAN"),).toBe(false,);

    expect(children[0]?.tagName,).toBe("H3",);
    expect(children[0]?.textContent,).toBe("QA Report: 1 scenes",);

    const pass = children.find((el,) => el.className === "vn-qa-pass");
    expect(pass?.textContent,).toBe("All checks passed",);

    const issueList = children.find((el,) => el.tagName === "UL");
    expect(issueList?.className,).toBe("vn-qa-issues",);
    const items = issueList?.children ?? [];
    expect(items.length,).toBe(report.issues.length,);
    expect(items[0]?.className,).toBe("vn-qa-issue vn-qa-warning",);
    expect(items[0]?.textContent,).toBe("[Scene 1] Non-narration scene missing character name",);
  });

  test("failing report renders no pass marker", () => {
    const report = runQaCheck([scene({ text: "", },),],);
    const children = render(makeElement("div",), report,);
    expect(children.some((el,) => el.className === "vn-qa-pass"),).toBe(false,);
  });

  test("issue text is 1-based per scene index and error items carry the error class", () => {
    const report = runQaCheck([scene(), scene({ text: "", },),],);
    const children = render(makeElement("div",), report,);
    const issueList = children.find((el,) => el.tagName === "UL");
    expect(issueList?.children[0]?.textContent,).toBe("[Scene 2] Scene has empty text content",);
    expect(issueList?.children[0]?.className,).toBe("vn-qa-issue vn-qa-error",);
  });
});
