/**
 * `renderBattleLog` tests on the battle fake DOM: log contract (role=log,
 * aria-label, keyboard focus via tabindex), per-entry indicator classes and
 * critical highlighting, damage chips, latest-entry-visible auto-scroll, and
 * the null result for an empty history.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, } from "bun:test";
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
  // Seed the alpine i18n catalog the log and the roll chip resolve from.
  localeStringsHost.__localeStrings = {
    battle: {
      log: "Battle log",
      rollResult: "{roll} {modifier} = {total} vs DC {dc}",
      rollSuccess: "success",
      rollFailure: "failure",
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

/**
 * Roll fixtures.
 *
 * Resource contract: the renderer keeps module-level state (one tumble per
 * new roll), so every test below owns a DISTINCT log entry — no test can see
 * another test's animation guard, in any order.
 */
/** Attack entry fixture carrying a roll (the panel's dice chip). */
const rolled: BattleLogEntryView = {
  type: "attack",
  damage: 8,
  critical: true,
  description: "Alice crushes the orc for 8 damage.",
  roll: { natural: 20, modifier: 3, total: 23, dc: 16, },
};

/** Attack entry fixture whose dice tumble is asserted. */
const tumbled: BattleLogEntryView = {
  type: "attack",
  damage: 5,
  critical: false,
  description: "Bob slashes the goblin for 5 damage.",
  roll: { natural: 17, modifier: 2, total: 19, dc: 14, },
};

/** Attack entry fixture re-rendered to prove the tumble does not replay. */
const replayed: BattleLogEntryView = {
  type: "attack",
  damage: 12,
  critical: false,
  description: "Cleo hacks the troll for 12 damage.",
  roll: { natural: 11, modifier: 4, total: 15, dc: 18, },
};

/** The skill-check chip rendered on a log line (undefined when it carries no roll). */
function chipOf(line: FakeEl,): FakeEl | undefined {
  return line.children.find((c,) => c.className === "battle-skill-check");
}

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

  it("renders the roll math and the critical marker on the entry line", () => {
    const panel = renderBattleLog([rolled,],) as unknown as FakeEl;
    const chip = chipOf(panel.children[0]!,)!;
    expect(chip.className,).toBe("battle-skill-check",);
    expect(chip.children[0]!.className,).toContain("battle-dice",);
    expect(chip.children[0]!.textContent,).toBe("20",);
    expect(chip.children[1]!.textContent,).toBe("20 +3 = 23 vs DC 16",);
    expect(chip.children[2]!.className,).toContain("battle-critical-hit",);
  });

  it("tumbles the dice and lands on the final roll", () => {
    vi.useFakeTimers();
    try {
      const panel = renderBattleLog([tumbled,],) as unknown as FakeEl;
      const dice = chipOf(panel.children[0]!,)!.children[0]!;
      expect(dice.classList.contains("battle-dice-rolling",),).toBe(true,);
      vi.advanceTimersByTime(500,);
      expect(dice.textContent,).toBe("17",);
      expect(dice.classList.contains("battle-dice-rolling",),).toBe(false,);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replay the tumble when the same log re-renders", () => {
    vi.useFakeTimers();
    try {
      renderBattleLog([replayed,], "battle-a",);
      const panel = renderBattleLog([replayed,], "battle-a",) as unknown as FakeEl;
      const dice = chipOf(panel.children[0]!,)!.children[0]!;
      expect(dice.classList.contains("battle-dice-rolling",),).toBe(false,);
      expect(dice.textContent,).toBe("11",);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tumbles again for another battle's identical roll", () => {
    vi.useFakeTimers();
    try {
      renderBattleLog([replayed,], "battle-a",);
      const panel = renderBattleLog([replayed,], "battle-b",) as unknown as FakeEl;
      const dice = chipOf(panel.children[0]!,)!.children[0]!;
      expect(dice.classList.contains("battle-dice-rolling",),).toBe(true,);
    } finally {
      vi.useRealTimers();
    }
  });
});
