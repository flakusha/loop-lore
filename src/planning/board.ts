// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Kanban board projection over plan items (TASK-kanban-board).
 *
 * Pure: no DB, no HTTP. Columns come from `planItemStateMachine.def.values`
 * (todo/doing/done/blocked) and swimlanes from `PlanItemKind` — the board
 * invents no state or kind vocabulary of its own, so a card that moves here
 * moves in the todo list because both read the same `plan_items` rows.
 *
 * `legalTargets` reads the transition table directly, so the UI can only ever
 * offer a move the service will accept; an illegal drop is answered 409 by
 * `POST /api/v1/plans/:id/advance` and the board re-renders from persisted
 * state (snap back).
 */
import { PlanItemKind, type PlanItemState, planItemStateMachine, } from "../db/enums-story/plans";
import type { PlanItemRow, } from "./service";

/** One swimlane row inside a column, keyed by `PlanItemKind`. */
export interface BoardLane {
  kind: PlanItemKind;
  cards: BoardCard[];
}

/** One board column, keyed by `PlanItemState`. */
export interface BoardColumn {
  state: PlanItemState;
  lanes: BoardLane[];
}

/** A card as the board needs it: row fields plus resolved links. */
export interface BoardCard {
  id: string;
  title: string;
  kind: PlanItemKind;
  state: PlanItemState;
  /** Set only when the row's chat_id resolves to a real chat row. */
  chatUrl: string | null;
  /** Related plan items this card links to, as `{ id, title }` pairs. */
  related: Array<{ id: string; title: string }>;
  /** States the card may legally move to, per the state machine. */
  targets: PlanItemState[];
}

/** Options for {@link buildBoard}. */
export interface BuildBoardOptions {
  /** Every plan item the viewer owns — the board projects these rows only. */
  items: PlanItemRow[];
  /** chat_id values that resolve to a real chat row; anything else gets no link. */
  resolvableChatIds?: ReadonlySet<string>;
  /** from_id → linked plan item ids, for the per-card related list. */
  relatedByItem?: ReadonlyMap<string, readonly string[]>;
}

/** Column order — the state machine's own value order, not a private list. */
export const BOARD_COLUMNS: readonly PlanItemState[] = planItemStateMachine.def.values;

/** Swimlane order — the persisted kind vocabulary. */
export const BOARD_KINDS: readonly PlanItemKind[] = Object.values(PlanItemKind,);

/**
 * @param state - the card's current state
 * @returns the states reachable from `state` per the transition table
 */
export function legalTargets(state: PlanItemState,): PlanItemState[] {
  return [...planItemStateMachine.def.transitions[state] ?? [],];
}

/**
 * @param opts
 * @param opts.items - every plan item the viewer owns
 * @param opts.resolvableChatIds - chat_ids with a backing chat row
 * @param opts.relatedByItem - plan_links grouped by from_id
 * @returns columns by state, each holding kind swimlanes; empty lanes are
 *   dropped so the board only renders lanes that hold cards
 */
export function buildBoard({ items, resolvableChatIds, relatedByItem, }: BuildBoardOptions,): BoardColumn[] {
  const byId = new Map(items.map((item,) => [item.id, item,]),);

  return BOARD_COLUMNS.map((state,) => {
    const inState = items.filter((item,) => item.state === state);
    const lanes: BoardLane[] = BOARD_KINDS
      .map((kind,) => ({
        kind,
        cards: inState
          .filter((item,) => item.kind === kind)
          .map((item,) => toCard({ item, byId, resolvableChatIds, relatedByItem, },)),
      }))
      .filter((lane,) => lane.cards.length > 0);

    return { state, lanes, };
  },);
}

/**
 * @param args
 * @param args.item
 * @param args.byId - every owned item, for resolving related-card titles
 * @param args.resolvableChatIds
 * @param args.relatedByItem
 * @returns the board card for one row
 */
function toCard({ item, byId, resolvableChatIds, relatedByItem, }: {
  item: PlanItemRow;
  byId: ReadonlyMap<string, PlanItemRow>;
  resolvableChatIds: ReadonlySet<string> | undefined;
  relatedByItem: ReadonlyMap<string, readonly string[]> | undefined;
},): BoardCard {
  const related = (relatedByItem?.get(item.id,) ?? [])
    .map((id,) => byId.get(id,))
    .filter((target,): target is PlanItemRow => target !== undefined)
    .map((target,) => ({ id: target.id, title: target.title, }));

  // chat_id may be a workflow pseudo-id (`workflow:<id>`) that has no chat
  // row — only link when the row actually resolves, so links never 404.
  const chatUrl = item.chat_id && resolvableChatIds?.has(item.chat_id,)
    ? `/views/chat?chatid=${encodeURIComponent(item.chat_id,)}`
    : null;

  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    state: item.state,
    chatUrl,
    related,
    targets: legalTargets(item.state,),
  };
}
