// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bestiary: monster templates and placed spawns.
 *
 * `monster_templates` holds the stat/loot/behavior definition; a NULL
 * `world_id` marks it global and visible from every world. `monster_spawns`
 * is one placed instance of a template at a location with a territorial
 * radius.
 *
 * Loot is rolled from a caller-supplied integer seed through a small
 * deterministic PRNG (mulberry32), so the same seed always yields the same
 * drop table - no `Math.random` anywhere in this module. Types live in
 * ./bestiary-types and are re-exported here; this file is the import surface.
 */
import { jsonStringifyOr, uid, } from "../utils";
import type {
  DespawnExpiredOptions,
  ListMonstersAtLocationOptions,
  ListMonsterTemplatesOptions,
  LootEntry,
  LootRoll,
  MonsterSpawnRow,
  MonsterTemplateRow,
  RegisterMonsterTemplateOptions,
  RollMonsterLootOptions,
  SpawnedMonster,
  SpawnMonsterOptions,
  TerritoryQuery,
} from "./bestiary-types";
import { getRpgLog, parseJsonField, } from "./shared/rpg-service-utils";

export type * from "./bestiary-types";

/**
 * Register a bestiary entry.
 * @param options
 * @returns the stored row, including its generated id.
 * @throws {Error} When `name` is blank - an unnamed bestiary row is unusable.
 */
export async function registerMonsterTemplate(
  options: RegisterMonsterTemplateOptions,
): Promise<MonsterTemplateRow> {
  const { db, template, now, } = options;
  if (template.name.trim() === "") { throw new Error("registerMonsterTemplate: name must not be blank",); }

  const at = now.toISOString();
  const row: MonsterTemplateRow = {
    id: uid(),
    world_id: template.worldId ?? null,
    name: template.name,
    category: template.category,
    subcategory: template.subcategory ?? null,
    size: template.size ?? "medium",
    alignment: template.alignment ?? "neutral",
    difficulty: template.difficulty ?? "standard",
    stats: jsonStringifyOr(template.stats ?? {},),
    loot_table: jsonStringifyOr(template.lootTable ?? [],),
    territorial: template.territorial === true ? 1 : 0,
    nocturnal: template.nocturnal === true ? 1 : 0,
    pack_size: template.packSize ?? 1,
    behavior: jsonStringifyOr(template.behavior ?? {},),
    created_at: at,
    updated_at: at,
  };

  await db.insertInto("monster_templates",).values(row,).execute();
  return row;
}

/**
 * List the bestiary a world can spawn from: its own entries plus the global
 * ones (`world_id` NULL).
 * @param options
 * @returns rows ordered by name.
 */
export async function listMonsterTemplates(
  options: ListMonsterTemplatesOptions,
): Promise<MonsterTemplateRow[]> {
  const { db, worldId, } = options;
  const base = db.selectFrom("monster_templates",).selectAll();
  const scoped = worldId === null
    ? base.where("world_id", "is", null,)
    : base.where((eb,) => eb.or([eb("world_id", "is", null,), eb("world_id", "=", worldId,),],));

  return scoped.orderBy("name", "asc",).execute();
}

/**
 * Place one instance of a template at a location.
 * @param options
 * @returns the stored spawn row.
 * @throws {Error} When `territory.radius` is negative - the DB CHECK would
 *   reject it anyway, and a bad radius is a caller bug worth naming.
 */
export async function spawnMonster(options: SpawnMonsterOptions,): Promise<MonsterSpawnRow> {
  const { db, worldId, locationId, templateId, territory, now, despawnAt = null, } = options;
  if (territory.radius < 0) { throw new Error("spawnMonster: territory radius must be >= 0",); }

  const row: MonsterSpawnRow = {
    id: uid(),
    world_id: worldId,
    location_id: locationId,
    template_id: templateId,
    spawned_at: now.toISOString(),
    territory_center_x: territory.centerX,
    territory_center_y: territory.centerY,
    territory_radius: territory.radius,
    despawn_at: despawnAt,
  };

  await db.insertInto("monster_spawns",).values(row,).execute();
  getRpgLog("bestiary",).debug("Spawned monster", { spawnId: row.id, templateId, locationId, },);
  return row;
}

/**
 * Remove every spawn whose `despawn_at` has passed.
 * @param options
 * @returns how many rows were removed.
 */
export async function despawnExpired(options: DespawnExpiredOptions,): Promise<number> {
  const { db, now, } = options;
  const result = await db
    .deleteFrom("monster_spawns",)
    .where("despawn_at", "is not", null,)
    .where("despawn_at", "<=", now.toISOString(),)
    .executeTakeFirst();

  return Number(result.numDeletedRows,);
}

/**
 * List the monsters standing at a location, with their templates resolved.
 *
 * Two queries rather than a join: the spawn set is small and pre-filtered, and
 * this keeps the template row whole instead of projecting 16 columns inline.
 * @param options
 * @returns `{ spawn, template }` pairs ordered by spawn time.
 */
export async function listMonstersAtLocation(
  options: ListMonstersAtLocationOptions,
): Promise<SpawnedMonster[]> {
  const { db, worldId, locationId, } = options;
  const spawns = await db
    .selectFrom("monster_spawns",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("location_id", "=", locationId,)
    .orderBy("spawned_at", "asc",)
    .execute();

  if (spawns.length === 0) { return []; }

  const templates = await db
    .selectFrom("monster_templates",)
    .selectAll()
    .where("id", "in", spawns.map((spawn,) => spawn.template_id),)
    .execute();

  const byId = new Map(templates.map((template,) => [template.id, template,]),);

  return spawns.flatMap((spawn,) => {
    const template = byId.get(spawn.template_id,);
    return template === undefined ? [] : [{ spawn, template, },];
  },);
}

/**
 * Whether a point falls inside a spawn's territory.
 *
 * Containment is INCLUSIVE: a point exactly `radius` from the center is still
 * held. Pure - no DB.
 * @param query
 * @returns true when `(x, y)` is within the boundary circle.
 */
export function getTerritoryAt(query: TerritoryQuery,): boolean {
  const { spawn, x, y, } = query;
  const dx = x - spawn.territory_center_x;
  const dy = y - spawn.territory_center_y;
  return Math.hypot(dx, dy,) <= spawn.territory_radius;
}

/**
 * Roll a template's loot table.
 *
 * Pure and deterministic: `rngSeed` seeds a mulberry32 stream, each entry is
 * tested in table order against the next uniform draw, and a hit yields the
 * entry's quantity (default 1). The same seed always returns the same rolls.
 * @param options
 * @returns the entries that dropped, in table order.
 */
export function rollMonsterLoot(options: RollMonsterLootOptions,): LootRoll[] {
  const { template, rngSeed, } = options;
  const table = parseJsonField<LootEntry[]>(template.loot_table, [],);
  const next = mulberry32(rngSeed,);
  const drops: LootRoll[] = [];

  for (const entry of table) {
    if (next() < entry.chance) { drops.push({ ...entry, quantity: entry.quantity ?? 1, },); }
  }

  return drops;
}

/** Mulberry32 PRNG - returns a uniform [0, 1) stream from an integer seed. */
function mulberry32(seed: number,): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1,);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61,);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
