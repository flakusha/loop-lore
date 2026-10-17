// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Kanban board surface (TASK-kanban-board): `GET /api/v1/planning/kanban`
 * renders the owner's `plan_items` as state columns with `PlanItemKind`
 * swimlanes. Card moves do NOT write here — they POST to the existing
 * `/api/v1/plans/:id/advance` verb, so the board and the todo list read the
 * same rows (one source of truth) and the board re-renders from persisted
 * state after every attempt.
 *
 * Ownership: `requireUserId` + `service.list(userId)` (owner-scoped query), the
 * same guard `planning.ts` uses for the REST verbs.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { type BoardCard, type BoardColumn, buildBoard, } from "../planning/board";
import { createPlanningService, type PlanItemRow, } from "../planning/service";
import { requireUserId, } from "./http-utils";
import { escapeHtml, htmlResponse, } from "./views/layout";

/**
 * @param opts
 * @param opts.database
 * @param prefix - API version prefix, e.g. `/api/v1`
 * @returns the board fragment route
 */
export function planningBoardRoutes({ database, }: { database: Kysely<DB> }, prefix: string,) {
  return new Elysia({ name: "planning-board", },)
    .get(`${prefix}/planning/kanban`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (userId instanceof Response) { return userId; }
      return htmlResponse(await renderKanbanBoard(database, userId,),);
    },);
}

/**
 * @param database
 * @param userId - the authenticated owner
 * @returns the board fragment HTML (columns + swimlanes + cards)
 */
async function renderKanbanBoard(database: Kysely<DB>, userId: string,): Promise<string> {
  const items = await createPlanningService(database,).list(userId,);
  const columns = buildBoard({
    items,
    resolvableChatIds: await resolveChatIds(database, items,),
    relatedByItem: await resolvePlanLinks(database, items,),
  },);

  const body = columns.map(renderColumn,).join("",);
  return body === ""
    ? `<p class="planning-kanban-empty">No plan items yet.</p>`
    : `<div class="planning-kanban-grid">${body}</div>`;
}

/**
 * `plan_items.chat_id` may hold a workflow pseudo-id (`workflow:<id>`) with no
 * chat row, so only ids that resolve to a real chat get a per-card link.
 * @param database
 * @param items
 * @returns the chat_ids that exist
 */
async function resolveChatIds(database: Kysely<DB>, items: PlanItemRow[],): Promise<Set<string>> {
  const chatIds = [...new Set(items.map((item,) => item.chat_id).filter((id,): id is string => id !== null),),];
  if (chatIds.length === 0) { return new Set(); }

  const rows = await database.selectFrom("chats",).select("id",).where("id", "in", chatIds,).execute();
  return new Set(rows.map((row,) => row.id),);
}

/**
 * @param database
 * @param items - the owner's rows, which bound the link query
 * @returns from_id → linked plan item ids (links to rows the viewer does not
 *   own are dropped by the projection, so nothing leaks across users)
 */
async function resolvePlanLinks(database: Kysely<DB>, items: PlanItemRow[],): Promise<Map<string, string[]>> {
  const ids = items.map((item,) => item.id);
  if (ids.length === 0) { return new Map(); }

  const rows = await database.selectFrom("plan_links",).select(["from_id", "to_id",],).where("from_id", "in", ids,)
    .execute();

  const byItem = new Map<string, string[]>();
  for (const row of rows) {
    const existing = byItem.get(row.from_id,);
    if (existing) {
      existing.push(row.to_id,);
    } else {
      byItem.set(row.from_id, [row.to_id,],);
    }
  }

  return byItem;
}

/**
 * @param column
 * @returns one state column with its kind swimlanes
 */
function renderColumn(column: BoardColumn,): string {
  const lanes = column.lanes
    .map((lane,) =>
      `<div class="planning-kanban-lane" data-kind="${lane.kind}" data-testid="planning-lane-${column.state}-${lane.kind}">
<span class="planning-kanban-lane-title">${lane.kind}</span>
${lane.cards.map(renderCard,).join("",)}</div>`
    )
    .join("",);

  return `<section class="planning-kanban-column" data-state="${column.state}" data-testid="planning-column-${column.state}" @dragover.prevent @drop="drop($event, '${column.state}')">
<h3 class="planning-kanban-column-title">${column.state}</h3>
<div class="planning-kanban-lanes">${lanes}</div>
</section>`;
}

/**
 * @param card
 * @returns one card: title, resolved links, and move buttons limited to the
 *   states the state machine allows (the UI never offers an illegal move)
 */
function renderCard(card: BoardCard,): string {
  const chatLink = card.chatUrl === null
    ? ""
    : `<a class="planning-kanban-card-chat" href="${
      escapeHtml(card.chatUrl,)
    }" data-testid="planning-card-chat-${card.id}">chat</a>`;

  const related = card.related
    .map((item,) =>
      `<a class="planning-kanban-card-related" href="#planning-card-${escapeHtml(item.id,)}">${
        escapeHtml(item.title,)
      }</a>`
    )
    .join("",);

  const moves = card.targets
    .map((target,) =>
      `<button type="button" class="planning-kanban-move" data-testid="planning-move-${card.id}-${target}" @click="move('${card.id}', '${target}')">${target}</button>`
    )
    .join("",);

  return `<article class="planning-kanban-card" id="planning-card-${card.id}" data-testid="planning-card-${card.id}" data-id="${card.id}" data-state="${card.state}" draggable="true" @dragstart="dragStart($event, '${card.id}')">
<span class="planning-kanban-card-title">${escapeHtml(card.title,)}</span>
${chatLink}
<span class="planning-kanban-card-related-list">${related}</span>
<span class="planning-kanban-card-moves">${moves}</span>
</article>`;
}
