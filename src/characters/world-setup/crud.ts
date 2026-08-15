/**
 * Character World Setup Service — CRUD dispatchers (Layer 2)
 */
import { jsonStringifyOr, uid, } from "../../utils";
import type {
  CharacterWorldSetupContext,
  CharacterWorldSetupRow,
  CreateWorldSetupInput,
  UpdateWorldSetupInput,
} from "./types";

/** Args for {@link getWorldSetup}. */
export interface GetWorldSetupArgs {
  thisL: CharacterWorldSetupContext;
  actorId: string;
  worldId: string;
}

/**
 * Get the world setup bundle for a character in a specific world.
 */
export async function getWorldSetup(
  { thisL, actorId, worldId, }: GetWorldSetupArgs,
): Promise<CharacterWorldSetupRow | undefined> {
  return thisL.db
    .selectFrom("character_world_setup",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
}

/** Args for {@link upsertWorldSetup}. */
export interface UpsertWorldSetupArgs {
  thisL: CharacterWorldSetupContext;
  input: CreateWorldSetupInput;
}

/**
 * Upsert a world setup bundle for a character in a world.
 *
 * Idempotent — creates the row on first call, merges into it on subsequent
 * calls. Returns the resulting row.
 */
export async function upsertWorldSetup(
  { thisL, input, }: UpsertWorldSetupArgs,
): Promise<CharacterWorldSetupRow> {
  const existing = await getWorldSetup({
    thisL,
    actorId: input.actorId,
    worldId: input.worldId,
  },);

  const now = new Date().toISOString();

  if (!existing) {
    const row: CharacterWorldSetupRow = {
      id: uid(),
      actor_id: input.actorId,
      world_id: input.worldId,
      starting_inventory: jsonStringifyOr(input.startingInventory ?? [], "[]",),
      lore_entries: jsonStringifyOr(input.loreEntries ?? [], "[]",),
      backstory: input.backstory ?? null,
      scenario_override: input.scenarioOverride ?? null,
      system_prompt_override: input.systemPromptOverride ?? null,
      initial_state: jsonStringifyOr(input.initialState ?? {}, "{}",),
      created_at: now,
      updated_at: now,
    };
    await thisL.db.insertInto("character_world_setup",).values(row,).execute();
    return row;
  }

  const merged = await updateWorldSetup({
    thisL,
    actorId: input.actorId,
    worldId: input.worldId,
    input,
  },);
  // updateWorldSetup returns undefined only if the row vanished concurrently;
  // fall back to re-reading so callers always get a row.
  return merged ?? getWorldSetup({
    thisL,
    actorId: input.actorId,
    worldId: input.worldId,
  },) as Promise<CharacterWorldSetupRow>;
}

/** Args for {@link updateWorldSetup}. */
export interface UpdateWorldSetupArgs {
  thisL: CharacterWorldSetupContext;
  actorId: string;
  worldId: string;
  input: UpdateWorldSetupInput;
}

/**
 * Update an existing world setup bundle. Returns undefined if no row exists.
 */
export async function updateWorldSetup(
  { thisL, actorId, worldId, input, }: UpdateWorldSetupArgs,
): Promise<CharacterWorldSetupRow | undefined> {
  const existing = await getWorldSetup({ thisL, actorId, worldId, },);
  if (!existing) { return undefined; }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.startingInventory !== undefined) {
    updates.starting_inventory = jsonStringifyOr(input.startingInventory, "[]",);
  }
  if (input.loreEntries !== undefined) {
    updates.lore_entries = jsonStringifyOr(input.loreEntries, "[]",);
  }
  if (input.backstory !== undefined) { updates.backstory = input.backstory; }
  if (input.scenarioOverride !== undefined) { updates.scenario_override = input.scenarioOverride; }
  if (input.systemPromptOverride !== undefined) { updates.system_prompt_override = input.systemPromptOverride; }
  if (input.initialState !== undefined) { updates.initial_state = jsonStringifyOr(input.initialState, "{}",); }

  await thisL.db
    .updateTable("character_world_setup",)
    .set(updates,)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .execute();

  return getWorldSetup({ thisL, actorId, worldId, },);
}

/** Args for {@link deleteWorldSetup}. */
export interface DeleteWorldSetupArgs {
  thisL: CharacterWorldSetupContext;
  actorId: string;
  worldId: string;
}

/**
 * Delete a world setup bundle. Returns true if a row was deleted.
 */
export async function deleteWorldSetup(
  { thisL, actorId, worldId, }: DeleteWorldSetupArgs,
): Promise<boolean> {
  const result = await thisL.db
    .deleteFrom("character_world_setup",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}
