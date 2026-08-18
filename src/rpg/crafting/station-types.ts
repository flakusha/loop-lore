// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting station type definitions, raw DB row shapes, and row mappers.
 *
 * Station defs describe a *type* of workstation (anvil, forge, …)
 * together with crafting bonuses.  Instances are physical placements
 * in the world, with durability tracking.
 */

import type { CraftingStationType, } from "../../db/enums-crafting.js";

// ── Station Definition types ──────────────────────────────

/** Input for creating a new station definition. */
export interface CreateStationDefOpts {
  worldId: string;
  name: string;
  description?: string | null;
  stationType: CraftingStationType;
  tier?: number;
  speedBonus?: number;
  qualityBonus?: number;
  successBonus?: number;
  materialSavingChance?: number;
  maxDurability?: number;
}

/** Fields that may be updated on an existing station definition. */
export interface UpdateStationDefOpts {
  name?: string;
  description?: string | null;
  stationType?: CraftingStationType;
  tier?: number;
  speedBonus?: number;
  qualityBonus?: number;
  successBonus?: number;
  materialSavingChance?: number;
  maxDurability?: number;
}

/** A station definition row mapped to camelCase. */
export interface StationDef {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  stationType: CraftingStationType;
  tier: number;
  speedBonus: number;
  qualityBonus: number;
  successBonus: number;
  materialSavingChance: number;
  maxDurability: number;
  createdAt: string;
  updatedAt: string;
}

// ── Station Instance types ────────────────────────────────

/** Input for placing a new station instance. */
export interface CreateStationInstanceOpts {
  stationDefId: string;
  worldId: string;
  locationId?: string | null;
  ownerActorId?: string | null;
  currentDurability: number;
  isActive?: boolean;
}

/** Fields that may be updated on an existing station instance. */
export interface UpdateStationInstanceOpts {
  locationId?: string | null;
  ownerActorId?: string | null;
  currentDurability?: number;
  isActive?: boolean;
}

/** A placed station instance row mapped to camelCase. */
export interface StationInstance {
  id: string;
  stationDefId: string;
  worldId: string;
  locationId: string | null;
  ownerActorId: string | null;
  currentDurability: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Raw DB row shapes (select results) ────────────────────

interface StationDefRow {
  id: string;
  world_id: string;
  name: string;
  description: string | null;
  station_type: CraftingStationType;
  tier: number;
  speed_bonus: number;
  quality_bonus: number;
  success_bonus: number;
  material_saving_chance: number;
  max_durability: number;
  created_at: string;
  updated_at: string;
}

interface StationInstanceRow {
  id: string;
  station_def_id: string;
  world_id: string;
  location_id: string | null;
  owner_actor_id: string | null;
  current_durability: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ── Row mappers ───────────────────────────────────────────

/** Map a raw DB row to the camelCase StationDef interface. */
export function mapDef(row: StationDefRow,): StationDef {
  return {
    id: row.id,
    worldId: row.world_id,
    name: row.name,
    description: row.description,
    stationType: row.station_type,
    tier: row.tier,
    speedBonus: row.speed_bonus,
    qualityBonus: row.quality_bonus,
    successBonus: row.success_bonus,
    materialSavingChance: row.material_saving_chance,
    maxDurability: row.max_durability,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Map a raw DB row to the camelCase StationInstance interface. */
export function mapInstance(row: StationInstanceRow,): StationInstance {
  return {
    id: row.id,
    stationDefId: row.station_def_id,
    worldId: row.world_id,
    locationId: row.location_id,
    ownerActorId: row.owner_actor_id,
    currentDurability: row.current_durability,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
