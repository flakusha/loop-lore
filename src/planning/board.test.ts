// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Board projection: columns follow the state machine, swimlanes follow
 * `PlanItemKind`, links resolve, and only legal moves are offered.
 */
import { describe, expect, test, } from "bun:test";
import { PlanItemKind, PlanItemState, } from "../db/enums-story/plans";
import { BOARD_COLUMNS, BOARD_KINDS, buildBoard, legalTargets, } from "./board";
import type { PlanItemRow, } from "./service";

/**
 * @param overrides
 * @returns a minimal plan_items row
 */
function row(overrides: Partial<PlanItemRow> = {},): PlanItemRow {
  return {
    id: "p1",
    owner_id: "user1",
    chat_id: null,
    title: "Step one",
    state: PlanItemState.Todo,
    kind: PlanItemKind.Step,
    position: 0,
    parent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("board columns and lanes", () => {
  test("columns come from the state machine, in its own order", () => {
    const board = buildBoard({ items: [], },);

    expect(board.map((column,) => column.state),).toEqual([...BOARD_COLUMNS,],);
    expect(board.map((column,) => column.state),).toEqual(["todo", "doing", "done", "blocked",],);
  });

  test("swimlanes cover every persisted kind, empty lanes are dropped", () => {
    const board = buildBoard({ items: [row({ kind: PlanItemKind.Creative, },),], },);
    const todoLanes = board.find((column,) => column.state === PlanItemState.Todo)?.lanes ?? [];

    expect(todoLanes.map((lane,) => lane.kind),).toEqual([PlanItemKind.Creative,],);
    expect(BOARD_KINDS,).toEqual(Object.values(PlanItemKind,),);
  });

  test("a card lands in the column and lane matching its row state and kind", () => {
    const board = buildBoard({
      items: [
        row({ id: "a", kind: PlanItemKind.Story, state: PlanItemState.Doing, },),
        row({ id: "b", kind: PlanItemKind.Story, state: PlanItemState.Done, },),
        row({ id: "c", kind: PlanItemKind.Draft, state: PlanItemState.Doing, },),
      ],
    },);

    const doing = board.find((column,) => column.state === PlanItemState.Doing);
    expect(doing?.lanes.map((lane,) => lane.kind),).toEqual([PlanItemKind.Story, PlanItemKind.Draft,],);
    expect(doing?.lanes[0]?.cards.map((card,) => card.id),).toEqual(["a",],);
    expect(doing?.lanes[1]?.cards.map((card,) => card.id),).toEqual(["c",],);
  });
});

describe("legal moves", () => {
  test("targets mirror the transition table, so no illegal move is offered", () => {
    expect(legalTargets(PlanItemState.Todo,),).toEqual([
      PlanItemState.Doing,
      PlanItemState.Blocked,
      PlanItemState.Done,
    ],);

    expect(legalTargets(PlanItemState.Done,),).toEqual([PlanItemState.Todo,],);
  });

  test("a card carries its own legal targets", () => {
    const board = buildBoard({ items: [row({ state: PlanItemState.Doing, },),], },);
    const doing = board.find((column,) => column.state === PlanItemState.Doing);

    expect(doing?.lanes[0]?.cards[0]?.targets,).toEqual([
      PlanItemState.Done,
      PlanItemState.Blocked,
      PlanItemState.Todo,
    ],);
  });
});

describe("per-card links", () => {
  test("a chat link is rendered only when chat_id resolves to a chat row", () => {
    const items = [
      row({ id: "linked", chat_id: "chat-1", },),
      row({ id: "pseudo", chat_id: "workflow:abc", },),
      row({ id: "none", chat_id: null, },),
    ];

    const board = buildBoard({ items, resolvableChatIds: new Set(["chat-1",],), },);
    const cards = board[0]?.lanes[0]?.cards ?? [];

    expect(cards.find((card,) => card.id === "linked")?.chatUrl,).toBe("/views/chat?chatid=chat-1",);
    expect(cards.find((card,) => card.id === "pseudo")?.chatUrl,).toBeNull();
    expect(cards.find((card,) => card.id === "none")?.chatUrl,).toBeNull();
  });

  test("related items resolve to owned rows only", () => {
    const items = [row({ id: "a", title: "A", },), row({ id: "b", title: "B", },),];
    const board = buildBoard({
      items,
      relatedByItem: new Map([["a", ["b", "not-mine",],],],),
    },);

    const card = board[0]?.lanes[0]?.cards.find((entry,) => entry.id === "a");

    expect(card?.related,).toEqual([{ id: "b", title: "B", },],);
  });
});
