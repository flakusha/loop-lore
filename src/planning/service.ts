// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Planning Service — CRUD + state machine for plan items.
 *
 * Plan items are user-owned steps in a multi-step workflow.
 * State machine: todo → doing → done, with blocked as a side state.
 */
import type { Kysely, } from "kysely";
import {
  PlanItemKind,
  PlanItemState,
  planItemStateMachine,
  PlanLinkRelation,
} from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";

// ── Types ──────────────────────────────────────────────────

export interface CreatePlanItemInput {
  owner_id: string;
  chat_id?: string | null;
  title: string;
  kind?: PlanItemKind;
  position?: number;
  parent_id?: string | null;
}

export interface UpdatePlanItemInput {
  title?: string;
  kind?: PlanItemKind;
  position?: number;
  parent_id?: string | null;
}

export interface PlanItemRow {
  id: string;
  owner_id: string;
  chat_id: string | null;
  title: string;
  state: PlanItemState;
  kind: PlanItemKind;
  position: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanLinkRow {
  from_id: string;
  to_id: string;
  relation: PlanLinkRelation;
  created_at: string;
}

export interface PlanningService {
  list(ownerId: string, chatId?: string,): Promise<PlanItemRow[]>;
  get(id: string,): Promise<PlanItemRow | null>;
  create(input: CreatePlanItemInput,): Promise<PlanItemRow>;
  update(id: string, input: UpdatePlanItemInput,): Promise<PlanItemRow | null>;
  advance(id: string, target: PlanItemState,): Promise<PlanItemRow | null>;
  delete(id: string,): Promise<boolean>;
  addLink(fromId: string, toId: string, relation: PlanLinkRelation,): Promise<PlanLinkRow>;
  listLinks(planItemId: string,): Promise<PlanLinkRow[]>;
}

// ── Service ────────────────────────────────────────────────

/**
 * @param database
 */
export function createPlanningService(database: Kysely<DB>,): PlanningService {
  return {
    async list(ownerId: string, chatId?: string,): Promise<PlanItemRow[]> {
      let query = database
        .selectFrom("plan_items",)
        .selectAll()
        .where("owner_id", "=", ownerId,)
        .orderBy("position", "asc",)
        .orderBy("created_at", "asc",);

      if (chatId) {
        query = query.where("chat_id", "=", chatId,) as typeof query;
      }

      const rows = await query.execute();
      return rows.map((r,) => ({
        ...r,
        state: r.state as PlanItemState,
        kind: r.kind as PlanItemKind,
      }));
    },

    async get(id: string,): Promise<PlanItemRow | null> {
      const row = await database
        .selectFrom("plan_items",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirst();

      if (!row) { return null; }
      return {
        ...row,
        state: row.state as PlanItemState,
        kind: row.kind as PlanItemKind,
      };
    },

    async create(input: CreatePlanItemInput,): Promise<PlanItemRow> {
      const id = uid();
      const now = new Date().toISOString();
      const row = await database
        .insertInto("plan_items",)
        .values({
          id,
          owner_id: input.owner_id,
          chat_id: input.chat_id ?? null,
          title: input.title,
          state: PlanItemState.Todo,
          kind: input.kind ?? PlanItemKind.Step,
          position: input.position ?? 0,
          parent_id: input.parent_id ?? null,
          created_at: now,
          updated_at: now,
        },)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...row,
        state: row.state as PlanItemState,
        kind: row.kind as PlanItemKind,
      };
    },

    async update(id: string, input: UpdatePlanItemInput,): Promise<PlanItemRow | null> {
      const now = new Date().toISOString();
      const row = await database
        .updateTable("plan_items",)
        .set({
          ...(input.title !== undefined ? { title: input.title, } : {}),
          ...(input.kind !== undefined ? { kind: input.kind, } : {}),
          ...(input.position !== undefined ? { position: input.position, } : {}),
          ...(input.parent_id !== undefined ? { parent_id: input.parent_id, } : {}),
          updated_at: now,
        },)
        .where("id", "=", id,)
        .returningAll()
        .executeTakeFirst();

      if (!row) { return null; }
      return {
        ...row,
        state: row.state as PlanItemState,
        kind: row.kind as PlanItemKind,
      };
    },

    async advance(id: string, target: PlanItemState,): Promise<PlanItemRow | null> {
      const item = await this.get(id,);
      if (!item) { return null; }
      planItemStateMachine.transition(item.state, target,);
      const now = new Date().toISOString();
      const row = await database
        .updateTable("plan_items",)
        .set({ state: target, updated_at: now, },)
        .where("id", "=", id,)
        .returningAll()
        .executeTakeFirst();

      if (!row) { return null; }
      return {
        ...row,
        state: row.state as PlanItemState,
        kind: row.kind as PlanItemKind,
      };
    },

    async delete(id: string,): Promise<boolean> {
      const result = await database
        .deleteFrom("plan_items",)
        .where("id", "=", id,)
        .executeTakeFirst();

      return Number(result.numDeletedRows,) > 0;
    },

    async addLink(fromId: string, toId: string, relation: PlanLinkRelation,): Promise<PlanLinkRow> {
      const now = new Date().toISOString();
      const row = await database
        .insertInto("plan_links",)
        .values({ from_id: fromId, to_id: toId, relation, created_at: now, },)
        .onConflict((oc,) => oc.doNothing())
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...row,
        relation: row.relation as PlanLinkRelation,
      };
    },

    async listLinks(planItemId: string,): Promise<PlanLinkRow[]> {
      const rows = await database
        .selectFrom("plan_links",)
        .selectAll()
        .where((eb,) => eb.or([eb("from_id", "=", planItemId,), eb("to_id", "=", planItemId,),],))
        .execute();

      return rows.map((r,) => ({
        ...r,
        relation: r.relation as PlanLinkRelation,
      }));
    },
  };
}
