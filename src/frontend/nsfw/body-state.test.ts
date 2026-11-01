import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { arousalTierLabel, renderBodyState, } from "./body-state";

let restoreDom: () => void;

// Sentinel save/restore for the i18n catalog (see battle/health-bar.test.ts):
// wipe via `= undefined` would leak into later files in a shared-process
// serial run, so restore whatever catalog was loaded before this file.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let savedLocaleStrings: unknown;
let hasSavedLocaleStrings = false;

beforeEach(() => {
  restoreDom = installBattleDom();
  savedLocaleStrings = localeStringsHost.__localeStrings;
  hasSavedLocaleStrings = true;
  localeStringsHost.__localeStrings = {
    nsfw: {
      bodyState: {
        title: "Body State",
        health: "Health",
        arousal: "Arousal",
        conditions: "Conditions",
        noConditions: "No active conditions",
        source: "Source: {source}",
        turnsLeft: "Turns left: {count}",
        arousalCalm: "Calm",
        arousalMild: "Mildly Aroused",
        arousalActive: "Aroused",
        arousalHigh: "Highly Aroused",
        arousalDesperate: "Desperate",
      },
    },
  };
},);

afterEach(() => {
  if (hasSavedLocaleStrings) {
    localeStringsHost.__localeStrings = savedLocaleStrings;
    hasSavedLocaleStrings = false;
  }

  restoreDom();
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

/** Read an element's attribute through the fake DOM's attr bag. */
function attr(el: FakeEl, name: string,): string | null {
  return el.getAttribute(name,);
}

/** Depth-first search for an element carrying a `data-testid` dataset entry. */
function byTestId(root: FakeEl, testId: string,): FakeEl | null {
  if (root.dataset["testid"] === testId) { return root; }
  for (const child of root.children) {
    const found = byTestId(child, testId,);
    if (found) { return found; }
  }

  return null;
}

/** The data-testid bag of an element (fake DOM stores dataset keys dotted). */
function testId(el: FakeEl,): string {
  return el.dataset["testid"] ?? el.dataset["testId"] ?? "";
}

/** Render a view under the fake DOM and type the result as a FakeEl. */
function render(view: Parameters<typeof renderBodyState>[0],): FakeEl {
  return renderBodyState(view,) as unknown as FakeEl;
}

describe("arousalTierLabel", () => {
  it("maps the server arousal tiers onto localized labels", () => {
    expect(arousalTierLabel(0,),).toBe("Calm",);
    expect(arousalTierLabel(19,),).toBe("Calm",);
    expect(arousalTierLabel(20,),).toBe("Mildly Aroused",);
    expect(arousalTierLabel(40,),).toBe("Aroused",);
    expect(arousalTierLabel(60,),).toBe("Highly Aroused",);
    expect(arousalTierLabel(80,),).toBe("Desperate",);
    expect(arousalTierLabel(100,),).toBe("Desperate",);
  });

  it("falls back to the key when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    expect(arousalTierLabel(50,),).toBe("nsfw.bodyState.arousalActive",);
  });
});

describe("renderBodyState", () => {
  it("renders nothing when the view has no data", () => {
    expect(renderBodyState({ health: null, arousal: null, conditions: [], },),).toBeNull();
  });

  it("renders the health row on the shared battle health bar", () => {
    const section = render({ health: { hp: 25, maxHp: 30, }, arousal: null, conditions: [], },);
    expect(section.className,).toBe("nsfw-body-state",);
    expect(attr(section, "role",),).toBe("group",);
    expect(attr(section, "aria-label",),).toBe("Body State",);
    expect(testId(section,),).toBe("nsfw-body-state",);

    const row = byTestId(section, "body-state-health",)!;
    const bar = row.children[1]!;
    expect(bar.getAttribute("role",),).toBe("progressbar",);
    expect(bar.getAttribute("aria-label",),).toBe("Health",);
    expect(bar.getAttribute("aria-valuenow",),).toBe("83",);
    expect(bar.style["width"],).toBe("83%",);
  });

  it("renders the arousal row as a 0-100 meter with its tier label", () => {
    const section = render({ health: null, arousal: { level: 65, }, conditions: [], },);
    const row = byTestId(section, "body-state-arousal",)!;
    const bar = row.children[1]!;
    expect(bar.getAttribute("role",),).toBe("progressbar",);
    expect(bar.getAttribute("aria-label",),).toBe("Arousal",);
    expect(bar.getAttribute("aria-valuenow",),).toBe("65",);
    expect(bar.style["width"],).toBe("65%",);
    expect(row.children[2]?.textContent,).toBe("Highly Aroused",);
  });

  it("renders conditions with source and duration metadata", () => {
    const section = render({
      health: null,
      arousal: null,
      conditions: [
        { id: "poisoned", name: "Poisoned", source: "snake", durationTurns: 3, },
        { id: "blessed", name: "Blessed", source: null, durationTurns: null, },
      ],
    },);

    const block = byTestId(section, "body-state-conditions",)!;
    const list = block.children.find((child,) => child.tagName === "UL");
    expect(list,).toBeDefined();
    expect(list!.children,).toHaveLength(2,);
    expect(list!.children[0]?.children[0]?.textContent,).toBe("Poisoned",);
    expect(list!.children[0]?.children[1]?.textContent,).toBe("Source: snake · Turns left: 3",);
    expect(list!.children[1]?.children[0]?.textContent,).toBe("Blessed",);
    expect(list!.children[1]?.children,).toHaveLength(1,);
  });

  it("shows the no-conditions line when every meter is present but none exist", () => {
    const section = render({ health: { hp: 1, maxHp: 2, }, arousal: { level: 0, }, conditions: [], },);
    const block = byTestId(section, "body-state-conditions",)!;
    const empty = block.children.find((child,) => child.className === "nsfw-body-state-empty");
    expect(empty?.textContent,).toBe("No active conditions",);
  });

  it("renders the conditions list even when both meters are absent", () => {
    const section = render({
      health: null,
      arousal: null,
      conditions: [{ id: "poisoned", name: "Poisoned", source: null, durationTurns: 2, },],
    },);

    expect(byTestId(section, "body-state-health",),).toBeNull();
    expect(byTestId(section, "body-state-arousal",),).toBeNull();
    expect(byTestId(section, "body-state-conditions",),).not.toBeNull();
  });
});
