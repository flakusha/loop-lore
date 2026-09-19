// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type ExpressionBuilder, type Kysely, } from "kysely";
import { assertNoCrossBoundaryWrite, } from "../../characters/world-boundary";
import {
  DifficultyReroll,
  DifficultyState,
  PublicationStatus,
  WorldKind,
  WorldVisibility,
} from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { WorldStateService, } from "../../story/world-state";
import { uid, } from "../../utils";
import { unauthorized, } from "../../validation/middleware";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonPaginated,
  jsonResponse,
} from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import { applyRpgUpdates, rpgCreateFlags, } from "./world-rpg-flags";

/**
 * @param database
 * @param page
 * @param pageSize
 * @param userId
 * @param q
 */
export async function handleListWorlds(
  database: Kysely<DB>,
  page: number,
  pageSize: number,
  userId: string | null,
  q?: string,
) {
  const offset = (page - 1) * pageSize;

  // Worlds visible to the user: owned, public, or joined (world member).
  const memberWorldIds: string[] = [];
  if (userId) {
    const rows = await database
      .selectFrom("world_members",)
      .select("world_id",)
      .where("actor_id", "=", userId,)
      .execute();
    for (const row of rows) {
      memberWorldIds.push(row.world_id,);
    }
  }

  let countQuery = database.selectFrom("worlds",).select(database.fn.countAll<number>().as("total",),);
  let listQuery = database.selectFrom("worlds",).selectAll();

  if (userId) {
    const visible = (eb: ExpressionBuilder<DB, "worlds">,) =>
      eb.or([
        eb("owner_id", "=", userId,),
        eb("visibility", "=", WorldVisibility.Public,),
        ...(memberWorldIds.length > 0 ? [eb("id", "in", memberWorldIds,),] : []),
      ],);
    countQuery = countQuery.where(visible,);
    listQuery = listQuery.where(visible,);
  } else {
    countQuery = countQuery.where("visibility", "=", WorldVisibility.Public,);
    listQuery = listQuery.where("visibility", "=", WorldVisibility.Public,);
  }

  const trimmedQ = q?.trim() ?? "";
  if (trimmedQ) {
    const like = `%${trimmedQ}%`;
    countQuery = countQuery.where("name", "like", like,);
    listQuery = listQuery.where("name", "like", like,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;
  const worlds = await listQuery.orderBy("name", "asc",).limit(pageSize,).offset(offset,).execute();
  return jsonPaginated({ data: worlds, total, page, pageSize, },);
}

/**
 * @param database
 * @param body
 * @param userId
 */
export async function handleCreateWorld(database: Kysely<DB>, body: Record<string, unknown>, userId: string | null,) {
  if (!userId) { return unauthorized(); }

  const name = body.name as string | undefined;
  if (!name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  const id = uid();
  const rpgFlags = rpgCreateFlags(body,);
  await database
    .insertInto("worlds",)
    .values({
      id,
      owner_id: userId,
      name,
      description: (body.description as string | undefined) ?? null,
      lore: (body.lore as string | undefined) ?? null,
      publication_status: PublicationStatus.Draft,
      kind: (body.kind as WorldKind | undefined) ?? WorldKind.Rpg,
      visibility: (body.visibility as WorldVisibility | undefined) ?? WorldVisibility.Private,
      scan_depth: 100,
      token_budget: 2000,
      difficulty_modifier: 1,
      difficulty_reroll: DifficultyReroll.None,
      difficulty_state: DifficultyState.Normal,
      ...rpgFlags,
    },)
    .execute();

  return jsonCreated({ id, },);
}

/**
 * @param database
 * @param worldId
 * @param userId
 * @param userRole
 */
export async function handleGetWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }
  const world = await database.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();
  return jsonResponse(world,);
}

/**
 * @param database
 * @param worldId
 * @param body
 * @param userId
 * @param userRole
 */
export async function handleUpdateWorld(
  database: Kysely<DB>,
  worldId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  // TASK-031: character/world boundary. A body carrying character-owned
  // fields is misdirected (the handler would silently drop them) - reject
  // it and point the client at the character API instead.
  const boundary = assertNoCrossBoundaryWrite("world", Object.keys(body,),);
  if (!boundary.ok) {
    return jsonError({ message: boundary.error.message, status: HttpStatus.UnprocessableEntity, },);
  }

  const updates: Record<string, unknown> = {};
  if (body.name != null) { updates.name = body.name; }
  if (body.description != null) { updates.description = body.description; }
  if (body.lore != null) { updates.lore = body.lore; }
  if (body.scanDepth != null) { updates.scan_depth = body.scanDepth; }
  if (body.tokenBudget != null) { updates.token_budget = body.tokenBudget; }
  if (body.difficultyModifier != null) { updates.difficulty_modifier = body.difficultyModifier; }
  if (body.difficultyReroll != null) { updates.difficulty_reroll = body.difficultyReroll; }
  if (body.difficultyState != null) { updates.difficulty_state = body.difficultyState; }
  if (body.kind != null) { updates.kind = body.kind; }
  if (body.visibility != null) { updates.visibility = body.visibility; }
  // Master switch arms every mechanic; per-mechanic flags after it refine
  // the result, so one request can enable RPG and opt a mechanic back out.
  applyRpgUpdates(body, updates,);
  updates.updated_at = new Date().toISOString();

  await database.updateTable("worlds",).set(updates,).where("id", "=", worldId,).execute();
  return jsonResponse({ ok: true, },);
}

/**
 * @param database
 * @param worldId
 * @param userId
 * @param userRole
 */
export async function handleInitializeStates(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const state = new WorldStateService(database,);
  const locationsCreated = await state.initializeLocationStates(worldId,);
  const npcsCreated = await state.initializeNpcStates(worldId,);

  return jsonResponse({ ok: true, locations_initialized: locationsCreated, npcs_initialized: npcsCreated, },);
}
