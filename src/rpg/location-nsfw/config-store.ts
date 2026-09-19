// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location NSFW config store.
 *
 * Raw persistence for `location_nsfw_config` rows: defaults, row mapping,
 * and CRUD. Encounter-facing reads live in `./service` and delegate here.
 */
import type { Kysely, } from "kysely";
import type { NsfwLocationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import { nowAndId, parseJsonField, } from "../shared/rpg-service-utils";
import type {
  LocationAtmosphere,
  LocationNsfwConfig,
  LocationRisks,
  UpdateLocationNsfwOpts,
} from "./types";

/** Raw `location_nsfw_config` row shape. */
export interface LocationNsfwRow {
  id: string;
  location_id: string;
  location_type: NsfwLocationType;
  privacy_level: string;
  discovery_chance: number;
  atmosphere: string;
  equipment: string;
  risks: string;
  created_at: string;
  updated_at: string;
}

/**
 * Default atmosphere scores for a new location config.
 * Shared by get-or-create inserts and row-mapping fallbacks.
 */
export function defaultAtmosphere(): LocationAtmosphere {
  return {
    romantic: 50,
    dangerous: 0,
    comfortable: 50,
    exotic: 0,
    seedy: 0,
  };
}

/**
 * Default risk factors for a new location config.
 * Shared by get-or-create inserts and row-mapping fallbacks.
 */
export function defaultRisks(): LocationRisks {
  return { discovery: 10, injury: 0, arrest: 0, reputation: 5, };
}

/**
 * Map a raw config row to its public shape.
 * @param row
 */
export function mapRowToConfig(row: LocationNsfwRow,): LocationNsfwConfig {
  return {
    id: row.id,
    locationId: row.location_id,
    locationType: row.location_type,
    privacyLevel: row.privacy_level,
    discoveryChance: row.discovery_chance,
    atmosphere: parseJsonField<LocationAtmosphere>(row.atmosphere, defaultAtmosphere(),),
    equipment: parseJsonField<string[]>(row.equipment, [],),
    risks: parseJsonField<LocationRisks>(row.risks, defaultRisks(),),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Store ────────────────────────────────────────────────────

/** Persists `location_nsfw_config` rows. */
export class LocationNsfwConfigStore {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get or create NSFW config for a location.
   * @param locationId
   */
  async getConfig(locationId: string,): Promise<LocationNsfwConfig> {
    const row = await this.db
      .selectFrom("location_nsfw_config",)
      .where("location_id", "=", locationId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return mapRowToConfig(row,);
    }

    // Create default config
    const { id, now, } = nowAndId();
    const atmosphere = defaultAtmosphere();
    const risks = defaultRisks();

    await this.db
      .insertInto("location_nsfw_config",)
      .values({
        id,
        location_id: locationId,
        location_type: "bedroom",
        privacy_level: "private",
        discovery_chance: 10,
        atmosphere: jsonStringifyOr(atmosphere,),
        equipment: "[]",
        risks: jsonStringifyOr(risks,),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      locationId,
      locationType: "bedroom",
      privacyLevel: "private",
      discoveryChance: 10,
      atmosphere,
      equipment: [],
      risks,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a location's NSFW config.
   * @param locationId
   * @param updates
   */
  async updateConfig(
    locationId: string,
    updates: UpdateLocationNsfwOpts,
  ): Promise<boolean> {
    const current = await this.getConfig(locationId,);
    const now = new Date().toISOString();
    const fields: Record<string, unknown> = { updated_at: now, };

    if (updates.locationType !== undefined) { fields.location_type = updates.locationType; }
    if (updates.privacyLevel !== undefined) { fields.privacy_level = updates.privacyLevel; }
    if (updates.discoveryChance !== undefined) { fields.discovery_chance = updates.discoveryChance; }
    if (updates.atmosphere !== undefined) {
      fields.atmosphere = jsonStringifyOr({ ...current.atmosphere, ...updates.atmosphere, },);
    }
    if (updates.equipment !== undefined) { fields.equipment = jsonStringifyOr(updates.equipment,); }
    if (updates.risks !== undefined) {
      fields.risks = jsonStringifyOr({ ...current.risks, ...updates.risks, },);
    }

    const result = await this.db
      .updateTable("location_nsfw_config",)
      .set(fields,)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /**
   * Get NSFW configs for multiple locations.
   * @param locationIds
   */
  async getConfigs(locationIds: string[],): Promise<LocationNsfwConfig[]> {
    if (locationIds.length === 0) { return []; }

    const rows = await this.db
      .selectFrom("location_nsfw_config",)
      .where("location_id", "in", locationIds,)
      .selectAll()
      .execute();

    return Array.from(rows, (r,) => mapRowToConfig(r,),);
  }

  /**
   * Delete a location's NSFW config.
   * @param locationId
   */
  async deleteConfig(locationId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("location_nsfw_config",)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }
}
