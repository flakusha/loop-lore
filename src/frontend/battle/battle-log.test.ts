/**
 * `renderBattleLog` tests on the battle fake DOM: log contract (role=log,
 * aria-label, keyboard focus via tabindex), per-entry indicator classes and
 * critical highlighting, damage chips, latest-entry-visible auto-scroll, and
 * the null result for an empty history.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { logTypeClass, renderBattleLog, scrollToLatest, } from "./battle-log";
import { type BattleLogEntryView, } from "./commands";

let restoreDom: () => void;

// Sentinel save/restore for the i18n catalog (see tests/i18n.test.ts): wipe
// via `= undefined` would leak into later files in a shared-process serial
// run, so restore whatever catalog was loaded before this file.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let savedLocaleStrings: unknown;
let hasSavedLocaleStrings = false;

beforeEach(() => {
  restoreDom = installBattleDom();
  savedLocaleStrings = localeStringsHost.__localeStrings;
  hasSavedLocaleStrings = true;
  // Seed the alpine i18n catalog the log resolves its label from.
  localeStringsHost.__localeStrings = {
    battle: { log: "Battle log", },
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

/** Attack entry fixture. */
const hit: BattleLogEntryView = {
  type: "attack",
  damage: 8,
  critical: true,
  description: "Alice crushes the orc for 8 damage.",
};

/** Heal entry fixture (no critical, positive HP delta). */
const heal: BattleLogEntryView = {
  type: "bonus_action",
  damage: 3,
  critical: false,
  description: "Alice recovers 3 HP.",
};

describe("logTypeClass", () => {
  it("maps known action types to an indicator class suffix", () => {
    expect(logTypeClass("attack",),).toBe(" is-attack",);
    expect(logTypeClass("bonus_action",),).toBe(" is-bonus_action",);
  });

  it("strips class-injection characters from malformed types", () => {
    expect(logTypeClass('attack" class="drop-icon',),).toBe(" is-attackclassdropicon",);
    expect(logTypeClass("42",),).toBe("",);
  });
});

describe("scrollToLatest", () => {
  it("pins the scroll position to the container's full height", () => {
    const el = { scrollTop: 0, scrollHeight: 420, } as HTMLElement;
    scrollToLatest(el,);
    expect(el.scrollTop,).toBe(420,);
  });
});

describe("renderBattleLog", () => {
  it("returns null for an empty history", () => {
    expect(renderBattleLog([],),).toBeNull();
  });

  it("renders an accessible keyboard-focusable log", () => {
    const panel = renderBattleLog([hit,],) as unknown as FakeEl;
    expect(panel.className,).toBe("battle-log",);
    expect(panel.getAttribute("role",),).toBe("log",);
    expect(panel.getAttribute("aria-live",),).toBe("polite",);
    expect(panel.getAttribute("aria-label",),).toBe("Battle log",);
    expect(panel.tabIndex,).toBe(0,);
  });

  it("renders entries with indicator classes, damage chips and narration", () => {
    const panel = renderBattleLog([hit, heal,],) as unknown as FakeEl;
    expect(panel.children,).toHaveLength(2,);

    const attackLine = panel.children[0]!;
    expect(attackLine.className,).toBe("battle-log-entry is-attack is-critical",);
    expect(attackLine.dataset.logType,).toBe("attack",);
    // Critical glyph first, damage chip second, narration last.
    expect(attackLine.children[0]!.className,).toBe("battle-log-crit",);
    expect(attackLine.children[1]!.className,).toBe("battle-log-damage",);
    expect(attackLine.children[1]!.textContent,).toBe("8",);
    expect(attackLine.children[2]!.className,).toBe("battle-log-text",);
    expect(attackLine.children[2]!.textContent,).toBe("Alice crushes the orc for 8 damage.",);

    const healLine = panel.children[1]!;
    expect(healLine.className,).toBe("battle-log-entry is-bonus_action",);
    expect(healLine.children,).toHaveLength(2,);
    expect(healLine.children[0]!.textContent,).toBe("3",);
  });

  it("auto-scrolls the fresh panel toward the latest entry", () => {
    const panel = renderBattleLog([hit, heal,],) as unknown as FakeEl;
    // The fake DOM has no layout (no scrollHeight), but the scroll-position
    // assignment proves the render pinned the view to the bottom; the
    // scrollTop = scrollHeight arithmetic is pinned by scrollToLatest above.
    expect(Object.hasOwn(panel, "scrollTop",),).toBeTrue();
  });

  it("falls back to the i18n key when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    const panel = renderBattleLog([hit,],) as unknown as FakeEl;
    expect(panel.getAttribute("aria-label",),).toBe("battle.log",);
  });
});
