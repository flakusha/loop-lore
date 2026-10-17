// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Kanban board component (TASK-kanban-board).
 *
 * Drag and the button-move fallback share ONE write path: both call
 * `move(id, state)`, which POSTs the existing `/api/v1/plans/:id/advance`
 * verb (the same endpoint the todo view's advance button hits) and then
 * re-issues the board's own `hx-get`. Re-rendering from the server after every
 * attempt is what makes a card reflect persisted state — an illegal transition
 * comes back 409, the row never moved, and the card lands back in its column.
 *
 * `init()` owns the FIRST load instead of `hx-trigger="load"`: the board mounts
 * on the chat view, which anonymous visitors can render, and its route is
 * auth-guarded — a load trigger issued a 401 request on every anonymous render.
 * Without `globalThis.__USER_ID` (the session signal `views/layout.html`
 * renders) `init()` issues nothing.
 */

import { refreshHtmx, } from "../dom";
import { apiFetch, } from "./htmx.js";
import { jsonBody, } from "./json";
import { log, } from "./logger";

const boardLog = log.child({ module: "planning-kanban", },);

/** Selector of the board root carrying the `hx-get` this component re-issues. */
const BOARD_SELECTOR = '[data-testid="planning-kanban"]';

/** Alpine state for `x-data="planningKanban()"`. */
export interface PlanningKanbanState {
  /** Id of the card currently being dragged, if any. */
  draggingId: string | null;
  /** First board load — skipped entirely when there is no session. */
  init(): void;
  /** Board-move fallback + drag result: advance the card, then re-render. */
  move(id: string, state: string,): Promise<void>;
  /** Remember the dragged card and seed the drag payload for non-Alpine drags. */
  dragStart(event: DragEvent, id: string,): void;
  /** Drop handler for a column: move the dragged card into it. */
  drop(event: DragEvent, state: string,): Promise<void>;
}

/**
 * @returns the Alpine component object for `x-data`
 */
export function planningKanban(): PlanningKanbanState {
  return {
    draggingId: null,

    init(): void {
      // The board partial mounts on the chat view, which anonymous visitors can
      // render, and this route is auth-guarded. Without a session there is
      // nothing to show, and requesting anyway would log a 401 on every render.
      if (!globalThis.__USER_ID) { return; }

      refreshHtmx(BOARD_SELECTOR,);
    },
    async move(id: string, state: string,): Promise<void> {
      try {
        await apiFetch(`/api/v1/plans/${encodeURIComponent(id,)}/advance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ state, },),
        },);
      } catch (err) {
        // 409 illegal transition, 404 foreign card: the row did not move, and
        // the re-render below puts the card back where it belongs.
        boardLog.warn("plan advance rejected", { id, state, err: String(err,), },);
      }

      // Always re-render: on success the card lands in its new column, on a
      // rejection it snaps back — either way the board shows persisted state.
      refreshHtmx(BOARD_SELECTOR,);
    },

    dragStart(event: DragEvent, id: string,): void {
      this.draggingId = id;
      event.dataTransfer?.setData("text/plain", id,);
    },

    async drop(event: DragEvent, state: string,): Promise<void> {
      event.preventDefault();
      const id = this.draggingId ?? event.dataTransfer?.getData("text/plain",) ?? "";
      this.draggingId = null;
      if (id === "") {
        return;
      }

      await this.move(id, state,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).planningKanban = planningKanban;
