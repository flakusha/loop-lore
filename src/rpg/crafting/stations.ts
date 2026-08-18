// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting station service — full CRUD for station definitions and placed
 * instances.
 *
 * Station defs describe a *type* of workstation (anvil, forge, …) together
 * with crafting bonuses.  Instances are physical placements in the world,
 * with durability tracking.  The type definitions, raw DB row shapes, and
 * row mappers live in `./station-types.ts`.
 */

import type { Kysely, } from "kysely";
import type { CraftingStationType, } from "../../db/enums-crafting.js";
import type { DB, } from "../../db/schema.js";
import { uid, } from "../../utils.js";
import {
  mapDef,
  mapInstance,
} from "./station-types.js";
import type {
  CreateStationDefOpts,
  CreateStationInstanceOpts,
  StationDef,
  StationInstance,
  UpdateStationDefOpts,
  UpdateStationInstanceOpts,
} from "./station-types.js";
export type {
  CreateStationDefOpts,
  CreateStationInstanceOpts,
  StationDef,
  StationInstance,
  UpdateStationDefOpts,
  UpdateStationInstanceOpts,
} from "./station-types.js";

// ── Service ───────────────────────────────────────────────

/** Full CRUD for station definitions and placed instances. */
export class StationsService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Definitions ─────────────────────────────────────────

  /** Create a new station definition. Returns the new ID. */
  async createStationDef(opts: CreateStationDefOpts,): Promise<string> {
    const id = uid();
    const now = new Date().toISOString();
    await this.db.insertInto("crafting_station_defs",).values({
      id,
      world_id: opts.worldId,
      name: opts.name,
      description: opts.description ?? null,
      station_type: opts.stationType,
      tier: opts.tier ?? 1,
      speed_bonus: opts.speedBonus ?? 0,
      quality_bonus: opts.qualityBonus ?? 0,
      success_bonus: opts.successBonus ?? 0,
      material_saving_chance: opts.materialSavingChance ?? 0,
      max_durability: opts.maxDurability ?? 100,
      created_at: now,
      updated_at: now,
    },).execute();
    return id;
  }

  /** Get a single station definition by ID. */
  async getStationDef(id: string,): Promise<StationDef | null> {
    const row = await this.db.selectFrom("crafting_station_defs",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirst();
    return row ? mapDef(row,) : null;
  }

  /** List station definitions for a world, optionally filtered by type. */
  async listStationDefs(
    worldId: string,
    type?: CraftingStationType,
  ): Promise<StationDef[]> {
    let q = this.db.selectFrom("crafting_station_defs",)
      .where("world_id", "=", worldId,)
      .orderBy("tier", "asc",)
      .orderBy("name", "asc",);
    if (type) { q = q.where("station_type", "=", type,); }
    const rows = await q.selectAll().execute();
    return Array.from(rows, mapDef,);
  }

  /** Update a station definition. Returns false when not found. */
  async updateStationDef(id: string, opts: UpdateStationDefOpts,): Promise<boolean> {
    const u: Record<string, unknown> = {};
    if (opts.name !== undefined) { u.name = opts.name; }
    if (opts.description !== undefined) { u.description = opts.description; }
    if (opts.stationType !== undefined) { u.station_type = opts.stationType; }
    if (opts.tier !== undefined) { u.tier = opts.tier; }
    if (opts.speedBonus !== undefined) { u.speed_bonus = opts.speedBonus; }
    if (opts.qualityBonus !== undefined) { u.quality_bonus = opts.qualityBonus; }
    if (opts.successBonus !== undefined) { u.success_bonus = opts.successBonus; }
    if (opts.materialSavingChance !== undefined) { u.material_saving_chance = opts.materialSavingChance; }
    if (opts.maxDurability !== undefined) { u.max_durability = opts.maxDurability; }
    if (Object.keys(u,).length === 0) { return true; }
    u.updated_at = new Date().toISOString();
    const r = await this.db.updateTable("crafting_station_defs",)
      .set(u,)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(r.numUpdatedRows,) > 0;
  }

  /** Delete a station definition. Returns false when not found. */
  async deleteStationDef(id: string,): Promise<boolean> {
    const r = await this.db.deleteFrom("crafting_station_defs",)
      .where("id", "=", id,)
      .executeTakeFirst();
    return (r.numDeletedRows ?? 0n) > 0n;
  }

  // ── Instances ───────────────────────────────────────────

  /** Place a new station instance. Returns the new ID. */
  async createInstance(opts: CreateStationInstanceOpts,): Promise<string> {
    const id = uid();
    const now = new Date().toISOString();
    await this.db.insertInto("crafting_station_instances",).values({
      id,
      station_def_id: opts.stationDefId,
      world_id: opts.worldId,
      location_id: opts.locationId ?? null,
      owner_actor_id: opts.ownerActorId ?? null,
      current_durability: opts.currentDurability,
      is_active: opts.isActive === false ? 0 : 1,
      created_at: now,
      updated_at: now,
    },).execute();
    return id;
  }

  /** Get a single station instance by ID. */
  async getInstance(id: string,): Promise<StationInstance | null> {
    const row = await this.db.selectFrom("crafting_station_instances",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirst();
    return row ? mapInstance(row,) : null;
  }

  /** List station instances for a world, optionally filtered by location. */
  async listInstances(
    worldId: string,
    locationId?: string,
  ): Promise<StationInstance[]> {
    let q = this.db.selectFrom("crafting_station_instances",)
      .where("world_id", "=", worldId,)
      .orderBy("created_at", "asc",);
    if (locationId) { q = q.where("location_id", "=", locationId,); }
    const rows = await q.selectAll().execute();
    return Array.from(rows, mapInstance,);
  }

  /** Update a station instance. Returns false when not found. */
  async updateInstance(id: string, opts: UpdateStationInstanceOpts,): Promise<boolean> {
    const u: Record<string, unknown> = {};
    if (opts.locationId !== undefined) { u.location_id = opts.locationId; }
    if (opts.ownerActorId !== undefined) { u.owner_actor_id = opts.ownerActorId; }
    if (opts.currentDurability !== undefined) { u.current_durability = opts.currentDurability; }
    if (opts.isActive !== undefined) { u.is_active = opts.isActive ? 1 : 0; }
    if (Object.keys(u,).length === 0) { return true; }
    u.updated_at = new Date().toISOString();
    const r = await this.db.updateTable("crafting_station_instances",)
      .set(u,)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(r.numUpdatedRows,) > 0;
  }

  /** Delete a station instance. Returns false when not found. */
  async deleteInstance(id: string,): Promise<boolean> {
    const r = await this.db.deleteFrom("crafting_station_instances",)
      .where("id", "=", id,)
      .executeTakeFirst();
    return (r.numDeletedRows ?? 0n) > 0n;
  }
}
