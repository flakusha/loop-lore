// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the VN sprite stage: roster CRUD, emotion-variant fallback,
 * deterministic slot assignment, and active-speaker highlight states.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeDom, installVnFakeDom, } from "../tests/vn-fake-dom";
import {
  addToRoster,
  applyStageHighlight,
  assignStageSlots,
  buildStageElement,
  createRoster,
  MAX_STAGE_SPRITES,
  removeFromRoster,
  resolveSpriteUrl,
  setSpriteVisibility,
  type SpriteRoster,
} from "./sprite-stage";

let dom: FakeDom;
beforeEach(() => {
  dom = installVnFakeDom();
},);
afterEach(() => {
  dom.restore();
},);

function rosterOf(ids: string[],): SpriteRoster {
  return createRoster(ids.map((id,) => ({ characterId: id, name: id, avatarAssetId: `asset-${id}`, })),);
}

describe("roster CRUD", () => {
  test("seeds entries visible and upserts by characterId", () => {
    const roster = rosterOf(["rin", "kai",],);
    expect(roster.entries.map((e,) => e.characterId),).toEqual(["rin", "kai",],);
    expect(roster.entries.every((e,) => e.visible),).toBe(true,);

    addToRoster(roster, { characterId: "rin", name: "Rin Updated", avatarAssetId: "asset-rin-2", },);
    expect(roster.entries,).toHaveLength(2,);
    expect(roster.entries[0]?.name,).toBe("Rin Updated",);

    addToRoster(roster, { characterId: "moe", name: "Moe", },);
    expect(roster.entries.map((e,) => e.characterId),).toEqual(["rin", "kai", "moe",],);
  });

  test("remove and visibility toggle report unknown ids", () => {
    const roster = rosterOf(["rin",],);
    expect(removeFromRoster(roster, "ghost",),).toBe(false,);
    expect(setSpriteVisibility(roster, "ghost", false,),).toBe(false,);

    expect(setSpriteVisibility(roster, "rin", false,),).toBe(true,);
    expect(roster.entries[0]?.visible,).toBe(false,);
    expect(removeFromRoster(roster, "rin",),).toBe(true,);
    expect(roster.entries,).toHaveLength(0,);
  });
});

describe("resolveSpriteUrl", () => {
  test("prefers the emotion variant and falls back to the base sprite", () => {
    const entry = {
      characterId: "rin",
      name: "Rin",
      avatarAssetId: "base-1",
      emotionVariants: { happy: "happy-9", },
    };
    expect(resolveSpriteUrl(entry, "happy",),).toBe("/api/assets/happy-9/thumb",);
    expect(resolveSpriteUrl(entry, "sad",),).toBe("/api/assets/base-1/thumb",);
    expect(resolveSpriteUrl(entry,),).toBe("/api/assets/base-1/thumb",);
  });

  test("yields undefined when no sprite is registered", () => {
    expect(resolveSpriteUrl({ characterId: "x", name: "X", },),).toBeUndefined();
  });

  test("matches variant keys case-insensitively", () => {
    const entry = {
      characterId: "rin",
      name: "Rin",
      avatarAssetId: "base-1",
      emotionVariants: { Happy: "happy-9", },
    };
    expect(resolveSpriteUrl(entry, "happy",),).toBe("/api/assets/happy-9/thumb",);
    expect(resolveSpriteUrl(entry, "HAPPY",),).toBe("/api/assets/happy-9/thumb",);
  });
});

describe("assignStageSlots", () => {
  test("layouts are deterministic per cast size and centered", () => {
    expect(assignStageSlots(rosterOf(["a",],), "a",).map((s,) => s.slot),).toEqual(["center",],);
    expect(assignStageSlots(rosterOf(["a", "b",],), "a",).map((s,) => s.slot),).toEqual(["left", "right",],);
    expect(assignStageSlots(rosterOf(["a", "b", "c",],), "b",).map((s,) => s.slot),).toEqual([
      "left",
      "center",
      "right",
    ],);
    expect(assignStageSlots(rosterOf(["a", "b", "c", "d", "e",],), "c",).map((s,) => s.slot),).toEqual([
      "far-left",
      "left",
      "center",
      "right",
      "far-right",
    ],);
  });

  test("hidden members leave the stage and extras stay off-stage", () => {
    const roster = rosterOf(["a", "b", "c",],);
    setSpriteVisibility(roster, "b", false,);
    const staged = assignStageSlots(roster, "a",);
    expect(staged.map((s,) => s.entry.characterId),).toEqual(["a", "c",],);
    expect(staged.map((s,) => s.slot),).toEqual(["left", "right",],);

    const big = rosterOf(["1", "2", "3", "4", "5", "6", "7",],);
    expect(assignStageSlots(big, "1",),).toHaveLength(MAX_STAGE_SPRITES,);
  });

  test("speaker is active, others dim; narration dims the whole stage", () => {
    const staged = assignStageSlots(rosterOf(["a", "b",],), "a",);
    expect(staged[0],).toMatchObject({ active: true, dimmed: false, },);
    expect(staged[1],).toMatchObject({ active: false, dimmed: true, },);
    // Active sprite lifts above the row but stays under dialogue UI.
    expect(staged[0]?.zIndex,).toBeGreaterThan(staged[1]?.zIndex ?? 0,);

    const narration = assignStageSlots(rosterOf(["a", "b",],), null,);
    expect(narration.every((s,) => !s.active && s.dimmed),).toBe(true,);

    const unknown = assignStageSlots(rosterOf(["a",],), "ghost",);
    expect(unknown[0],).toMatchObject({ active: false, dimmed: true, },);
  });
});

describe("stage elements", () => {
  test("sprite element carries slot, speaker state, and character key", () => {
    const [staged,] = assignStageSlots(rosterOf(["rin",],), "rin",);
    const el = buildStageElement(staged!, "happy",) as unknown as {
      className: string;
      style: Record<string, string>;
      dataset: Record<string, string>;
    };
    expect(el.className,).toContain("vn-stage-sprite",);
    expect(el.className,).toContain("vn-slot-center",);
    expect(el.className,).toContain("vn-speaker-active",);
    expect(el.className,).not.toContain("vn-speaker-dimmed",);
    expect(el.dataset["characterId"],).toBe("rin",);
    expect(el.style["zIndex"],).toBe(String(staged?.zIndex ?? "",),);
  });

  test("highlight toggle swaps focus classes without touching layout styles", () => {
    const roster = rosterOf(["a", "b",],);
    const [first, second,] = assignStageSlots(roster, "b",);
    const el = buildStageElement(first!,) as unknown as {
      className: string;
      classList: { contains: (cls: string,) => boolean };
      style: Record<string, string>;
    };
    expect(el.classList.contains("vn-speaker-dimmed",),).toBe(true,);

    applyStageHighlight(el as unknown as HTMLElement, { ...first!, active: true, dimmed: false, },);
    expect(el.classList.contains("vn-speaker-active",),).toBe(true,);
    expect(el.classList.contains("vn-speaker-dimmed",),).toBe(false,);
    expect(second?.dimmed,).toBe(false,);
  });
});
