// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { BattleSummary, } from "../../rpg/service/battles/summary.js";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { renderBattleSummary, } from "./battle-summary.js";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
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
    },],) as unknown as FakeEl;

    const [headline, meta, toggle, log,] = card.children;
    expect(headline!.textContent,).toBe("**Combat over — the party win!**",);
    expect(meta!.className,).toBe("battle-summary-meta",);
    expect(toggle!.getAttribute("aria-expanded",),).toBe("false",);
    expect((log as FakeEl & { hidden: boolean }).hidden,).toBe(true,);
    toggle!.click();
    expect(toggle!.getAttribute("aria-expanded",),).toBe("true",);
    expect((log as FakeEl & { hidden: boolean }).hidden,).toBe(false,);
  });

  it("omits the toggle when the log is empty", () => {
    const card = renderBattleSummary(summary(), [],) as unknown as FakeEl;
    expect(card.children,).toHaveLength(2,);
  });
});
