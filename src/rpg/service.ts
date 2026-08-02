/**
 * RPG Service
 *
 * Database persistence for RPG mechanics:
 * - Dice roll logging
 * - Character stat management
 * - XP tracking
 * - Loot table management
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema.js";
import { getLogger, type Logger, } from "../logger/index.js";

function log(): Logger {
  return getLogger().child({ module: "rpg-service", },);
}

export interface RpgServiceDeps {
  database: Kysely<DB>;
}

// ── Dice Roll Logging ────────────────────────────────────────

export interface LogDiceRollParams {
  userId: string;
  chatId?: string;
  actorId?: string;
  sides: number;
  count: number;
  modifier: number;
  advantageMode: string;
  exploding: boolean;
  rawRolls: number[];
  rawTotal: number;
  total: number;
  purpose?: string;
}

export async function logDiceRoll(
  deps: RpgServiceDeps,
  params: LogDiceRollParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("dice_roll_history",)
    .values({
      id,
      user_id: params.userId,
      chat_id: params.chatId ?? null,
      actor_id: params.actorId ?? null,
      sides: params.sides,
      count: params.count,
      modifier: params.modifier,
      advantage_mode: params.advantageMode,
      exploding: params.exploding ? 1 : 0,
      raw_rolls: JSON.stringify(params.rawRolls,),
      raw_total: params.rawTotal,
      total: params.total,
      purpose: params.purpose ?? null,
    },)
    .execute();

  log().debug("Logged dice roll", { id, total: params.total, },);
  return id;
}

export async function getDiceRollHistory(
  deps: RpgServiceDeps,
  params: { userId: string; chatId?: string; limit?: number },
): Promise<
  {
    id: string;
    sides: number;
    count: number;
    modifier: number;
    advantageMode: string;
    total: number;
    purpose: string | null;
    createdAt: string;
  }[]
> {
  const { database, } = deps;
  const limit = params.limit ?? 50;

  let query = database
    .selectFrom("dice_roll_history",)
    .where("user_id", "=", params.userId,)
    .select([
      "id",
      "sides",
      "count",
      "modifier",
      "advantage_mode",
      "total",
      "purpose",
      "created_at",
    ],)
    .orderBy("created_at", "desc",)
    .limit(limit,);

  if (params.chatId) {
    query = query.where("chat_id", "=", params.chatId,);
  }

  const rows = await query.execute();

  return rows.map((r,) => ({
    id: r.id,
    sides: r.sides,
    count: r.count,
    modifier: r.modifier,
    advantageMode: r.advantage_mode,
    total: r.total,
    purpose: r.purpose,
    createdAt: r.created_at,
  }));
}

// ── Character Stats ──────────────────────────────────────────

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

// ── XP Ledger ────────────────────────────────────────────────

export interface LogXpParams {
  actorId: string;
  amount: number;
  source: string;
  description?: string;
  referenceId?: string;
  chatId?: string;
}

export async function logXp(
  deps: RpgServiceDeps,
  params: LogXpParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("xp_ledger",)
    .values({
      id,
      actor_id: params.actorId,
      amount: params.amount,
      source: params.source,
      description: params.description ?? null,
      reference_id: params.referenceId ?? null,
      chat_id: params.chatId ?? null,
    },)
    .execute();

  log().debug("Logged XP", { id, actorId: params.actorId, amount: params.amount, },);
  return id;
}

export async function getXpHistory(
  deps: RpgServiceDeps,
  actorId: string,
  limit = 50,
): Promise<
  {
    id: string;
    amount: number;
    source: string;
    description: string | null;
    createdAt: string;
  }[]
> {
  const { database, } = deps;

  return database
    .selectFrom("xp_ledger",)
    .where("actor_id", "=", actorId,)
    .select([
      "id",
      "amount",
      "source",
      "description",
      "created_at",
    ],)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute()
    .then((rows,) =>
      rows.map((r,) => ({
        id: r.id,
        amount: r.amount,
        source: r.source,
        description: r.description,
        createdAt: r.created_at,
      }))
    );
}

// ── Loot Tables ──────────────────────────────────────────────

export interface CreateLootTableParams {
  name: string;
  sourceType: string;
  sourceId?: string;
}

export async function createLootTable(
  deps: RpgServiceDeps,
  params: CreateLootTableParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("loot_tables",)
    .values({
      id,
      name: params.name,
      source_type: params.sourceType,
      source_id: params.sourceId ?? null,
      total_weight: 0,
    },)
    .execute();

  log().debug("Created loot table", { id, name: params.name, },);
  return id;
}

export interface AddLootEntryParams {
  lootTableId: string;
  itemName: string;
  description?: string;
  itemType: string;
  rarity: string;
  weight: number;
  minQuantity?: number;
  maxQuantity?: number;
  minLevel?: number;
  metadata?: Record<string, unknown>;
}

export async function addLootEntry(
  deps: RpgServiceDeps,
  params: AddLootEntryParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("loot_entries",)
    .values({
      id,
      loot_table_id: params.lootTableId,
      item_name: params.itemName,
      description: params.description ?? null,
      item_type: params.itemType,
      rarity: params.rarity,
      weight: params.weight,
      min_quantity: params.minQuantity ?? 1,
      max_quantity: params.maxQuantity ?? 1,
      min_level: params.minLevel ?? 0,
      metadata: JSON.stringify(params.metadata ?? {},),
    },)
    .execute();

  // Update total weight
  await database
    .updateTable("loot_tables",)
    .set((eb,) => ({
      total_weight: eb("total_weight", "+", params.weight,),
      updated_at: new Date().toISOString(),
    }))
    .where("id", "=", params.lootTableId,)
    .execute();

  log().debug("Added loot entry", { id, itemName: params.itemName, },);
  return id;
}

export async function rollLootTable(
  deps: RpgServiceDeps,
  lootTableId: string,
): Promise<
  {
    itemName: string;
    description: string | null;
    itemType: string;
    rarity: string;
    quantity: number;
  } | null
> {
  const { database, } = deps;

  // Get all entries
  const entries = await database
    .selectFrom("loot_entries",)
    .where("loot_table_id", "=", lootTableId,)
    .selectAll()
    .execute();

  if (entries.length === 0) {
    return null;
  }

  // Mark table as used
  await database
    .updateTable("loot_tables",)
    .set({ used: 1, },)
    .where("id", "=", lootTableId,)
    .execute();

  // Weighted random selection
  const totalWeight = entries.reduce((sum, e,) => sum + e.weight, 0,);
  let random = Math.random() * totalWeight;

  for (const entry of entries) {
    random -= entry.weight;
    if (random <= 0) {
      const quantity = entry.min_quantity + Math.floor(
        Math.random() * (entry.max_quantity - entry.min_quantity + 1),
      );
      return {
        itemName: entry.item_name,
        description: entry.description,
        itemType: entry.item_type,
        rarity: entry.rarity,
        quantity,
      };
    }
  }

  // Fallback (should not happen)
  const fallback = entries[0]!;
  return {
    itemName: fallback.item_name,
    description: fallback.description,
    itemType: fallback.item_type,
    rarity: fallback.rarity,
    quantity: fallback.min_quantity,
  };
}
