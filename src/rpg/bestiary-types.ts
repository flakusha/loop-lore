// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bestiary types. Split from ./bestiary to keep that module under the 250L
 * ceiling; re-exported from ./bestiary, which is the only import surface.
 */
import type { Kysely, Selectable, } from "kysely";
import type { MonsterAlignment, MonsterCategory, MonsterDifficulty, MonsterSize, } from "../db/enums-story";
import type { DB, } from "../db/schema";

/** Raw `monster_templates` row. */
export type MonsterTemplateRow = Selectable<DB["monster_templates"]>;
/** Raw `monster_spawns` row. */
export type MonsterSpawnRow = Selectable<DB["monster_spawns"]>;

/** One entry of a `monster_templates.loot_table`. */
export interface LootEntry {
  itemId: string;
  /** 0..1 drop probability. */
  chance: number;
  quantity?: number;
}

/** A rolled drop; `quantity` is always resolved. */
export interface LootRoll extends LootEntry {
  quantity: number;
}

/** Fields accepted when registering a template; the rest have defaults. */
export interface MonsterTemplateInput {
  name: string;
  category: MonsterCategory;
  /** NULL `worldId` registers a global, every-world template. */
  worldId?: string | null;
  subcategory?: string | null;
  size?: MonsterSize;
  alignment?: MonsterAlignment;
  difficulty?: MonsterDifficulty;
  stats?: Record<string, number>;
  lootTable?: LootEntry[];
  territorial?: boolean;
  nocturnal?: boolean;
  packSize?: number;
  behavior?: Record<string, number>;
}

/** A spawn's territorial footprint in world units. */
export interface MonsterTerritory {
  centerX: number;
  centerY: number;
  /** Radius; containment is inclusive of the boundary. */
  radius: number;
}

/** A spawn joined with the template it instantiates. */
export interface SpawnedMonster {
  spawn: MonsterSpawnRow;
  template: MonsterTemplateRow;
}

/** The three territory columns a containment test reads. */
export interface SpawnTerritory {
  territory_center_x: number;
  territory_center_y: number;
  territory_radius: number;
}

/** Options for {@link registerMonsterTemplate}. */
export interface RegisterMonsterTemplateOptions {
  db: Kysely<DB>;
  template: MonsterTemplateInput;
  now: Date;
}

/** Options for {@link listMonsterTemplates}. */
export interface ListMonsterTemplatesOptions {
  db: Kysely<DB>;
  /** Pass null to list only the global bestiary. */
  worldId: string | null;
}

/** Options for {@link spawnMonster}. */
export interface SpawnMonsterOptions {
  db: Kysely<DB>;
  worldId: string;
  locationId: string;
  templateId: string;
  territory: MonsterTerritory;
  now: Date;
  /** NULL spawns never expire. */
  despawnAt?: string | null;
}

/** Options for {@link despawnExpired}. */
export interface DespawnExpiredOptions {
  db: Kysely<DB>;
  now: Date;
}

/** Options for {@link listMonstersAtLocation}. */
export interface ListMonstersAtLocationOptions {
  db: Kysely<DB>;
  worldId: string;
  locationId: string;
}

/** Inputs to {@link rollMonsterLoot}. */
export interface RollMonsterLootOptions {
  template: Pick<MonsterTemplateRow, "loot_table">;
  rngSeed: number;
}

/** Inputs to {@link getTerritoryAt}. */
export interface TerritoryQuery {
  spawn: SpawnTerritory;
  x: number;
  y: number;
}
