// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Selection-state reducer tests for message multi-select (no network). */
import { describe, expect, test, } from "bun:test";
import { messageBulk, reduceMessageSelection, } from "./message-bulk";

const VISIBLE = ["m1", "m2", "m3", "m4",];

describe("reduceMessageSelection", () => {
  test("plain toggle adds, then removes, and moves the anchor", () => {
    const first = reduceMessageSelection({ selectedMessageIds: [], anchorId: null, }, "m2", VISIBLE,);
    expect(first.selectedMessageIds,).toEqual(["m2",],);
    expect(first.anchorId,).toBe("m2",);

    const second = reduceMessageSelection(first, "m2", VISIBLE,);
    expect(second.selectedMessageIds,).toEqual([],);
    expect(second.anchorId,).toBe("m2",);
  });

  test("shift-click selects the inclusive range from the anchor", () => {
    const anchored = reduceMessageSelection({ selectedMessageIds: [], anchorId: null, }, "m1", VISIBLE,);
    const ranged = reduceMessageSelection(anchored, "m3", VISIBLE, true,);
    expect(ranged.selectedMessageIds,).toEqual(["m1", "m2", "m3",],);
    expect(ranged.anchorId,).toBe("m1",);
  });

  test("shift-click works backwards and keeps earlier selections", () => {
    const anchored = reduceMessageSelection(
      {
        selectedMessageIds: ["m4",],
        anchorId: "m4",
      },
      "m2",
      VISIBLE,
      true,
    );

    expect(anchored.selectedMessageIds,).toEqual(["m4", "m2", "m3",],);
  });

  test("shift-click without an anchor toggles normally", () => {
    const result = reduceMessageSelection({ selectedMessageIds: [], anchorId: null, }, "m3", VISIBLE, true,);
    expect(result.selectedMessageIds,).toEqual(["m3",],);
  });

  test("an empty id is a no-op", () => {
    const state = { selectedMessageIds: ["m1",], anchorId: "m1", };
    expect(reduceMessageSelection(state, "", VISIBLE,),).toBe(state,);
  });
});

describe("message bulk selection methods", () => {
  test("selectAllVisibleMessages picks each visible id once", () => {
    const ctx = { groupedMessages: VISIBLE.map((id,) => ({ id, })), selectedMessageIds: [] as string[], };
    messageBulk.selectAllVisibleMessages!.call(ctx as never,);
    expect(ctx.selectedMessageIds,).toEqual(VISIBLE,);
  });

  test("clearMessageSelection resets ids and anchor", () => {
    const ctx = {
      selectedMessageIds: ["m1", "m2",],
      _messageSelectionAnchorId: "m2",
    };

    messageBulk.clearMessageSelection!.call(ctx as never,);
    expect(ctx.selectedMessageIds,).toEqual([],);
    expect(ctx._messageSelectionAnchorId,).toBeNull();
  });
});
