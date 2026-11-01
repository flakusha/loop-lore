/**
 * `renderStatusEffects` tests on the battle fake DOM: badge contract
 * (role/list + per-badge aria-label/title tooltip), i18n group label,
 * and the null result for a condition-free combatant.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderStatusEffects, } from "./status-effects";

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
  // Seed the alpine i18n catalog the badge row resolves its label from.
  localeStringsHost.__localeStrings = {
    battle: { statusEffects: "Status effects", },
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

describe("renderStatusEffects", () => {
  it("returns null for a combatant without conditions", () => {
    expect(renderStatusEffects([],),).toBeNull();
  });

  it("renders an accessible badge list with the i18n group label", () => {
    const row = renderStatusEffects(["stunned",],) as NonNullable<ReturnType<typeof renderStatusEffects>>;
    expect(row.className,).toBe("battle-status-effects",);
    expect(row.getAttribute("role",),).toBe("list",);
    expect(row.getAttribute("aria-label",),).toBe("Status effects",);
  });

  it("renders one labelled tooltip badge per condition", () => {
    const row = renderStatusEffects(["stunned", "poisoned",],)!;
    expect(row.children,).toHaveLength(2,);

    const stunned = row.children[0]!;
    expect(stunned.className,).toBe("battle-status-badge",);
    expect(stunned.getAttribute("role",),).toBe("listitem",);
    expect(stunned.getAttribute("aria-label",),).toBe("stunned",);
    expect(stunned.getAttribute("title",),).toBe("stunned",);
    expect(stunned.textContent,).toBe("stunned",);

    const poisoned = row.children[1]!;
    expect(poisoned.getAttribute("aria-label",),).toBe("poisoned",);
    expect(poisoned.getAttribute("title",),).toBe("poisoned",);
  });

  it("falls back to the i18n key when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    expect(renderStatusEffects(["stunned",],)!.getAttribute("aria-label",),).toBe("battle.statusEffects",);
  });
});
