// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { npcDisplay, } from "./npc-display";

describe("npcDisplay helpers", () => {
  test("disposition colors map every known tier, unknown falls back to muted", () => {
    expect(npcDisplay.getDispositionColor("hostile",),).toBe("var(--accent-red)",);
    expect(npcDisplay.getDispositionColor("friendly",),).toBe("var(--accent-green)",);
    expect(npcDisplay.getDispositionColor("exalted",),).toBe("var(--accent-gold)",);
    expect(npcDisplay.getDispositionColor("whatever",),).toBe("var(--text-muted)",);
  });

  test("disposition labels capitalize, strength/karma label the bands", () => {
    expect(npcDisplay.getDispositionLabel("friendly",),).toBe("Friendly",);
    expect(npcDisplay.getStrengthLabel(80,),).toBe("Strong",);
    expect(npcDisplay.getStrengthLabel(10,),).toBe("Minimal",);
    expect(npcDisplay.getKarmaLabel(80,),).toBe("Saintly",);
    expect(npcDisplay.getKarmaLabel(-80,),).toBe("Evil",);
  });

  test("karma colors split at zero, percent maps -100..100 to 0..100", () => {
    expect(npcDisplay.getKarmaColor(10,),).toBe("var(--text-muted)",);
    expect(npcDisplay.getKarmaColor(-10,),).toBe("var(--accent-red)",);
    expect(npcDisplay.karmaPercent(100,),).toBe(100,);
    expect(npcDisplay.karmaPercent(-100,),).toBe(0,);
  });

  test("relationship rows resolve names and fall back to the unknown label", () => {
    const rows = npcDisplay.relationshipRows(
      [
        {
          id: "rel-1",
          actorId: "a1",
          targetActorId: "a2",
          worldId: null,
          relationshipType: "friend",
          standing: 10,
          trust: 20,
          familiarity: 30,
          isBidirectional: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        } as never,
      ],
      { resolveName: (id,) => (id === "a2" ? "Borin" : ""), unknownLabel: "?", },
    );

    expect(rows,).toEqual([
      {
        id: "rel-1",
        targetName: "Borin",
        type: "friend",
        standing: 10,
        trust: 20,
        familiarity: 30,
        isBidirectional: true,
      },
    ],);
  });

  test("faction tier/color resolve in-range, fall back out of range", () => {
    expect(npcDisplay.getFactionTier(10_000,),).toBe("Neutral",);
    expect(npcDisplay.getFactionStandingColor(10_000,),).toBe("var(--text-muted)",);
  });
});
