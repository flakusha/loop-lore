// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the outfit × emotion selection ladder (v2).
 *
 * Pins rung ORDER (exact → outfit-neutral → default → base/outfitless)
 * and the deterministic tie-break within a rung — the acceptance bar of
 * TASK-wardrobe-selection-algorithm-v2.
 */
import { describe, expect, it, } from "bun:test";
import type { Avatar, } from "../avatar-service/types";
import { runOutfitLadder, } from "./selection-ladder";

function avatar(overrides: Partial<Avatar> & { id: string },): Avatar {
  return {
    actorId: "actor-1",
    assetId: `asset-${overrides.id}`,
    label: overrides.id,
    tags: {},
    isPrimary: false,
    sortOrder: 0,
    outfitId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const armor = "outfit-armor";
const court = "outfit-court";

describe("runOutfitLadder", () => {
  it("rung 1: exact (outfit, emotion) wins over everything", () => {
    const avatars = [
      avatar({ id: "base-joy", tags: { emotion: "joy", }, }),
      avatar({ id: "armor-neutral", outfitId: armor, tags: { emotion: "neutral", }, }),
      avatar({ id: "armor-joy", outfitId: armor, tags: { emotion: "joy", }, }),
      avatar({ id: "court-joy", outfitId: court, tags: { emotion: "joy", }, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: armor, emotion: "joy", },);
    expect(picked?.id,).toBe("armor-joy",);
  });

  it("rung 2: falls back to (outfit, neutral) before leaving the outfit", () => {
    const avatars = [
      avatar({ id: "base-joy", tags: { emotion: "joy", }, }),
      avatar({ id: "armor-neutral", outfitId: armor, tags: { emotion: "neutral", }, }),
    ];
    const picked = runOutfitLadder(avatars, {
      outfitId: armor,
      defaultOutfitId: court,
      emotion: "joy",
    },);
    expect(picked?.id,).toBe("armor-neutral",);
  });

  it("rung 3: default outfit's emotion variant beats outfitless base", () => {
    const avatars = [
      avatar({ id: "base-joy", tags: { emotion: "joy", }, }),
      avatar({ id: "court-joy", outfitId: court, tags: { emotion: "joy", }, }),
    ];
    const picked = runOutfitLadder(avatars, {
      outfitId: armor,
      defaultOutfitId: court,
      emotion: "joy",
    },);
    expect(picked?.id,).toBe("court-joy",);
  });

  it("rung 4: outfitless emotion variants (today's behavior) survive", () => {
    const avatars = [
      avatar({ id: "base-joy", tags: { emotion: "joy", }, }),
      avatar({ id: "base-neutral", tags: { emotion: "neutral", }, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: armor, emotion: "joy", },);
    expect(picked?.id,).toBe("base-joy",);
  });

  it("rung 4 prefers exact emotion over outfitless neutral", () => {
    const avatars = [
      avatar({ id: "base-neutral", tags: { emotion: "neutral", }, sortOrder: 0, }),
      avatar({ id: "base-joy", tags: { emotion: "joy", }, sortOrder: 5, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: armor, emotion: "joy", },);
    expect(picked?.id,).toBe("base-joy",);
  });

  it("returns null when every rung misses (caller falls to base portrait)", () => {
    const avatars = [
      avatar({ id: "armor-sad", outfitId: armor, tags: { emotion: "sad", }, }),
      avatar({ id: "base-sad", tags: { emotion: "sad", }, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: court, emotion: "joy", },);
    expect(picked,).toBeNull();
  });

  it("without an emotion, prefers the outfit's neutral variant", () => {
    const avatars = [
      avatar({ id: "armor-joy", outfitId: armor, tags: { emotion: "joy", }, sortOrder: 0, }),
      avatar({ id: "armor-neutral", outfitId: armor, tags: { emotion: "neutral", }, sortOrder: 5, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: armor, },);
    expect(picked?.id,).toBe("armor-neutral",);
  });

  it("tie-break within a rung: primary first, then sort order", () => {
    const pool = [
      avatar({ id: "armor-joy-a", outfitId: armor, tags: { emotion: "joy", }, sortOrder: 1, }),
      avatar({
        id: "armor-joy-primary",
        outfitId: armor,
        tags: { emotion: "joy", },
        sortOrder: 9,
        isPrimary: true,
      }),
      avatar({ id: "armor-joy-b", outfitId: armor, tags: { emotion: "joy", }, sortOrder: 2, }),
    ];
    const picked = runOutfitLadder(pool, { outfitId: armor, emotion: "joy", },);
    expect(picked?.id,).toBe("armor-joy-primary",);
  });

  it("emotion match is case-insensitive", () => {
    const avatars = [
      avatar({ id: "armor-joy", outfitId: armor, tags: { emotion: "Joy", }, }),
    ];
    const picked = runOutfitLadder(avatars, { outfitId: armor, emotion: "JOY", },);
    expect(picked?.id,).toBe("armor-joy",);
  });

  it("never picks another outfit's variants on any rung", () => {
    const avatars = [
      avatar({ id: "court-joy", outfitId: court, tags: { emotion: "joy", }, isPrimary: true, }),
    ];
    // court is neither resolved outfit nor declared default.
    const picked = runOutfitLadder(avatars, { outfitId: armor, emotion: "joy", },);
    expect(picked,).toBeNull();
  });
});
