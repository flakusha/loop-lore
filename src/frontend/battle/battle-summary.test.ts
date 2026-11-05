// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { BattleSummary, } from "../../rpg/service/battles/summary.js";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { renderBattleSummary, } from "./battle-summary.js";

let restoreDom: () => void;

// Pre-file catalog state: whatever earlier files in this worker left in place.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let savedLocaleStrings: unknown;
let hasSavedLocaleStrings = false;

beforeEach(() => {
  restoreDom = installBattleDom();
  savedLocaleStrings = localeStringsHost.__localeStrings;
  hasSavedLocaleStrings = true;
  // Seed the alpine i18n catalog the summary card resolves its label from.
  localeStringsHost.__localeStrings = {
    battle: {
      battleSummary: "Battle summary",
      hideLog: "Hide full log",
      log: "Battle log",
      showLog: "Show full log ({count})",
    },
  };
},);

afterEach(() => {
  restoreDom();
  if (hasSavedLocaleStrings) {
    localeStringsHost.__localeStrings = savedLocaleStrings;
    hasSavedLocaleStrings = false;
  }
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

function summary(): BattleSummary {
  return {
    battleId: "b1",
    over: true,
    winner: "player",
    rounds: 3,
    survivors: ["Alice",],
    fallen: ["Orc",],
    lines: ["**Combat over — the party win!**", "Rounds: 3",],
  };
}

describe("renderBattleSummary", () => {
  it("renders collapsed with a toggle", () => {
    const card = renderBattleSummary(summary(), [{
      type: "attack",
      critical: false,
      description: "Alice hits",
    },], "battle-summary",) as unknown as FakeEl;

    const [headline, meta, toggle, log,] = card.children;
    expect(headline!.textContent,).toBe("**Combat over — the party win!**",);
    expect(meta!.className,).toBe("battle-summary-meta",);
    expect(toggle!.textContent,).toBe("Show full log (1)",);
    expect(toggle!.getAttribute("aria-expanded",),).toBe("false",);
    expect((log as FakeEl & { hidden: boolean }).hidden,).toBe(true,);
    toggle!.click();
    expect(toggle!.getAttribute("aria-expanded",),).toBe("true",);
    expect(toggle!.textContent,).toBe("Hide full log",);
    expect((log as FakeEl & { hidden: boolean }).hidden,).toBe(false,);
  });

  it("omits the toggle when the log is empty", () => {
    const card = renderBattleSummary(summary(), [], "battle-summary",) as unknown as FakeEl;
    expect(card.children,).toHaveLength(2,);
  });

  it("labels the card from the i18n catalog", () => {
    const card = renderBattleSummary(summary(), [], "battle-summary",) as unknown as FakeEl;
    expect(card.getAttribute("aria-label",),).toBe("Battle summary",);
  });

  it("falls back to the i18n key when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    const card = renderBattleSummary(summary(), [], "battle-summary",) as unknown as FakeEl;
    expect(card.getAttribute("aria-label",),).toBe("battle.battleSummary",);
  });
});
