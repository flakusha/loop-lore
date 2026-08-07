import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

export interface CreateCharacterStatsParams {
  actorId: string;
  level?: number;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  ac: number;
  speed?: number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

export async function createCharacterStats(
  deps: RpgServiceDeps,
  params: CreateCharacterStatsParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("character_stats",)
    .values({
      id,
      actor_id: params.actorId,
      level: params.level ?? 1,
      hp: params.hp,
      max_hp: params.maxHp,
      temp_hp: 0,
      mp: params.mp ?? 0,
      max_mp: params.maxMp ?? 0,
      ac: params.ac,
      speed: params.speed ?? 30,
      str: params.str ?? 10,
      dex: params.dex ?? 10,
      con: params.con ?? 10,
      int: params.int ?? 10,
      wis: params.wis ?? 10,
      cha: params.cha ?? 10,
      hit_dice: "{}",
      death_save_successes: 0,
      death_save_failures: 0,
      xp: 0,
      xp_to_next: 0,
    },)
    .execute();

  log().debug("Created character stats", { id, actorId: params.actorId, },);
  return id;
}

export async function getCharacterStats(
  deps: RpgServiceDeps,
  actorId: string,
): Promise<
  {
    id: string;
    level: number;
    hp: number;
    maxHp: number;
    tempHp: number;
    mp: number;
    maxMp: number;
    ac: number;
    speed: number;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    xp: number;
    xpToNext: number;
  } | null
> {
  const { database, } = deps;

  const row = await database
    .selectFrom("character_stats",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    level: row.level,
    hp: row.hp,
    maxHp: row.max_hp,
    tempHp: row.temp_hp,
    mp: row.mp,
    maxMp: row.max_mp,
    ac: row.ac,
    speed: row.speed,
    str: row.str,
    dex: row.dex,
    con: row.con,
    int: row.int,
    wis: row.wis,
    cha: row.cha,
    xp: row.xp,
    xpToNext: row.xp_to_next,
  };
}

export interface UpdateCharacterStatsParams {
  hp?: number;
  maxHp?: number;
  tempHp?: number;
  mp?: number;
  maxMp?: number;
  ac?: number;
  speed?: number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  level?: number;
  xp?: number;
  xpToNext?: number;
}

export async function updateCharacterStats(
  deps: RpgServiceDeps,
  statsId: string,
  params: UpdateCharacterStatsParams,
): Promise<boolean> {
  const { database, } = deps;

  const updates: Record<string, unknown> = {};
  if (params.hp !== undefined) { updates.hp = params.hp; }
  if (params.maxHp !== undefined) { updates.max_hp = params.maxHp; }
  if (params.tempHp !== undefined) { updates.temp_hp = params.tempHp; }
  if (params.mp !== undefined) { updates.mp = params.mp; }
  if (params.maxMp !== undefined) { updates.max_mp = params.maxMp; }
  if (params.ac !== undefined) { updates.ac = params.ac; }
  if (params.speed !== undefined) { updates.speed = params.speed; }
  if (params.str !== undefined) { updates.str = params.str; }
  if (params.dex !== undefined) { updates.dex = params.dex; }
  if (params.con !== undefined) { updates.con = params.con; }
  if (params.int !== undefined) { updates.int = params.int; }
  if (params.wis !== undefined) { updates.wis = params.wis; }
  if (params.cha !== undefined) { updates.cha = params.cha; }
  if (params.level !== undefined) { updates.level = params.level; }
  if (params.xp !== undefined) { updates.xp = params.xp; }
  if (params.xpToNext !== undefined) { updates.xp_to_next = params.xpToNext; }

  if (Object.keys(updates,).length === 0) {
    return false;
  }

  updates.updated_at = new Date().toISOString();

  const result = await database
    .updateTable("character_stats",)
    .set(updates,)
    .where("id", "=", statsId,)
    .executeTakeFirst();

  const updated = Number(result.numUpdatedRows,) > 0;
  if (updated) {
    log().debug("Updated character stats", { statsId, },);
  }
  return updated;
}
