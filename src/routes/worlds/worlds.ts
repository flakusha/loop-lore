import { type ExpressionBuilder, type Kysely, } from "kysely";
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
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
} from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";

export async function handleListWorlds(database: Kysely<DB>, page: number, pageSize: number, userId: string | null,) {
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

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;
  const worlds = await listQuery.orderBy("name", "asc",).limit(pageSize,).offset(offset,).execute();
  return jsonPaginated({ data: worlds, total, page, pageSize, },);
}

export async function handleCreateWorld(database: Kysely<DB>, body: Record<string, unknown>, userId: string | null,) {
  if (!userId) { return unauthorized(); }

  const name = body.name as string | undefined;
  if (!name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  const id = uid();
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
    },)
    .execute();

  return jsonCreated({ id, },);
}

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

export async function handleUpdateWorld(
  database: Kysely<DB>,
  worldId: string,
  body: Record<string, unknown>,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

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
  updates.updated_at = new Date().toISOString();

  await database.updateTable("worlds",).set(updates,).where("id", "=", worldId,).execute();
  return jsonResponse({ ok: true, },);
}

export async function handleDeleteWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const locationIds = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .execute();
  const locIds = Array.from(locationIds, (l,) => l.id,);
  if (locIds.length > 0) {
    await database.deleteFrom("location_states",).where("location_id", "in", locIds,).execute();
  }

  // Unlink chats bound to the world or any of its locations — chats survive
  // but lose their world/location binding (nullable FK columns, no cascade).
  if (locIds.length > 0) {
    await database
      .updateTable("chats",)
      .set({ current_location_id: null, },)
      .where("current_location_id", "in", locIds,)
      .execute();
  }
  await database
    .updateTable("chats",)
    .set({ world_id: null, },)
    .where("world_id", "=", worldId,)
    .execute();

  await database.deleteFrom("npc_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_lore_entries",).where("world_id", "=", worldId,).execute();

  const questIds = await database.selectFrom("quests",).select("id",).where("world_id", "=", worldId,).execute();
  const qIds = Array.from(questIds, (q,) => q.id,);
  if (qIds.length > 0) { await database.deleteFrom("quest_progress",).where("quest_id", "in", qIds,).execute(); }

  await database.deleteFrom("quests",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_items",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("items",).where("world_id", "=", worldId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "world",)
    .where("entity_id", "=", worldId,)
    .execute();
  await database.deleteFrom("locations",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("worlds",).where("id", "=", worldId,).execute();
  return jsonNoContent();
}

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
