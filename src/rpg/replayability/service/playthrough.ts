import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getLogger, } from "../../../logger";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import type { CreatePlaythroughInput, Playthrough, } from "./types";
import { PlusDifficulty, } from "./types";

function getLog() {
  return getLogger().child({ module: "replayability", },);
}

/** Parse JSON field safely */
export function parseJsonField<T,>(raw: unknown, fallback: T,): T {
  if (typeof raw !== "string") { return fallback; }
  return jsonParseOr(raw, fallback,);
}

/** Convert database row to Playthrough interface */
export function rowToPlaythrough(row: any,): Playthrough {
  return {
    id: row.id,
    playerId: row.player_id,
    worldId: row.world_id,
    playthroughNumber: row.playthrough_number,
    difficulty: row.difficulty,
    isCompleted: row.is_completed,
    endingId: row.ending_id,
    endingType: row.ending_type,
    completionTime: row.completion_time,
    choicesMade: row.choices_made,
    secretsFound: row.secrets_found,
    achievementsUnlocked: row.achievements_unlocked,
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/** Get playthrough count for a player in a world */
export async function getPlaythroughCount(
  db: Kysely<DB>,
  playerId: string,
  worldId: string,
): Promise<number> {
  const result = await (db as any)
    .selectFrom("playthroughs",)
    .where("player_id", "=", playerId,)
    .where("world_id", "=", worldId,)
    .select((eb: any,) => eb.fn.count("id",).as("count",))
    .executeTakeFirst();

  return Number(result?.count ?? 0,);
}

/**
 * Start a new playthrough
 */
export async function startPlaythrough(
  db: Kysely<DB>,
  input: CreatePlaythroughInput,
): Promise<Playthrough> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // Get playthrough number
  const existingCount = await getPlaythroughCount(db, input.playerId, input.worldId,);

  const playthroughData = {
    id,
    player_id: input.playerId,
    world_id: input.worldId,
    playthrough_number: existingCount + 1,
    difficulty: input.difficulty ?? PlusDifficulty.Normal,
    is_completed: false,
    ending_id: null,
    ending_type: null,
    completion_time: 0,
    choices_made: 0,
    secrets_found: 0,
    achievements_unlocked: 0,
    metadata: jsonStringifyOr(input.metadata ?? {},),
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  await (db as any).insertInto("playthroughs",).values(playthroughData,).execute();

  getLog().info("Playthrough started", {
    id,
    playerId: input.playerId,
    worldId: input.worldId,
    playthroughNumber: existingCount + 1,
  },);

  return rowToPlaythrough(playthroughData,);
}

/**
 * Get playthrough by ID
 */
export async function getPlaythrough(
  db: Kysely<DB>,
  playthroughId: string,
): Promise<Playthrough | null> {
  const row = await (db as any)
    .selectFrom("playthroughs",)
    .where("id", "=", playthroughId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToPlaythrough(row,) : null;
}

/**
 * Get all playthroughs for a player
 */
export async function getPlayerPlaythroughs(
  db: Kysely<DB>,
  playerId: string,
  worldId?: string,
): Promise<Playthrough[]> {
  let query = (db as any)
    .selectFrom("playthroughs",)
    .where("player_id", "=", playerId,)
    .orderBy("playthrough_number", "desc",);

  if (worldId) {
    query = query.where("world_id", "=", worldId,);
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (row: any,) => rowToPlaythrough(row,),);
}

/**
 * Record a choice made during playthrough
 */
export async function recordChoice(db: Kysely<DB>, playthroughId: string,): Promise<void> {
  await (db as any)
    .updateTable("playthroughs",)
    .set({
      choices_made: (db as any).raw("choices_made + 1",),
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", playthroughId,)
    .execute();
}

/**
 * Record a secret found during playthrough
 */
export async function recordSecretFound(
  db: Kysely<DB>,
  playthroughId: string,
  secretId: string,
): Promise<void> {
  const playthrough = await getPlaythrough(db, playthroughId,);
  if (!playthrough) { throw new Error("Playthrough not found",); }

  const secrets = parseJsonField<string[]>(playthrough.metadata.secrets ?? [], [],);
  if (!secrets.includes(secretId,)) {
    secrets.push(secretId,);
  }

  await (db as any)
    .updateTable("playthroughs",)
    .set({
      secrets_found: secrets.length,
      metadata: jsonStringifyOr({
        ...playthrough.metadata,
        secrets,
      },),
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", playthroughId,)
    .execute();
}
