/**
 * Location NSFW Config Service
 *
 * Manages NSFW-relevant metadata for world locations:
 * - Location type classification (bedroom, tavern, forest, etc.)
 * - Privacy level and discovery chance
 * - Atmosphere scores (romantic, dangerous, comfortable, etc.)
 * - Available equipment and risk factors
 *
 * Location config affects encounter availability and mechanics.
 */
import type { Kysely, } from "kysely";
import type { NsfwLocationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import { nowAndId, parseJsonField, } from "../shared/rpg-service-utils";

// ── Types ──────────────────────────────────────────────────

/** Atmosphere scores for a location. */
export interface LocationAtmosphere {
  romantic: number;
  dangerous: number;
  comfortable: number;
  exotic: number;
  seedy: number;
}

/** Risk factors for a location. */
export interface LocationRisks {
  discovery: number;
  injury: number;
  arrest: number;
  reputation: number;
}

/** NSFW config for a location. */
export interface LocationNsfwConfig {
  id: string;
  locationId: string;
  locationType: NsfwLocationType;
  privacyLevel: string;
  discoveryChance: number;
  atmosphere: LocationAtmosphere;
  equipment: string[];
  risks: LocationRisks;
  createdAt: string;
  updatedAt: string;
}

/** Options for updating a location's NSFW config. */
export interface UpdateLocationNsfwOpts {
  locationType?: NsfwLocationType;
  privacyLevel?: string;
  discoveryChance?: number;
  atmosphere?: Partial<LocationAtmosphere>;
  equipment?: string[];
  risks?: Partial<LocationRisks>;
}

// ── Service ────────────────────────────────────────────────

export class LocationNsfwService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get or create NSFW config for a location.
   */
  async getConfig(locationId: string,): Promise<LocationNsfwConfig> {
    const row = await this.db
      .selectFrom("location_nsfw_config",)
      .where("location_id", "=", locationId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.getRow(row,);
    }

    // Create default config
    const { id, now, } = nowAndId();

    const defaultAtmosphere: LocationAtmosphere = {
      romantic: 50,
      dangerous: 0,
      comfortable: 50,
      exotic: 0,
      seedy: 0,
    };

    const defaultRisks: LocationRisks = {
      discovery: 10,
      injury: 0,
      arrest: 0,
      reputation: 5,
    };

    await this.db
      .insertInto("location_nsfw_config",)
      .values({
        id,
        location_id: locationId,
        location_type: "bedroom",
        privacy_level: "private",
        discovery_chance: 10,
        atmosphere: jsonStringifyOr(defaultAtmosphere,),
        equipment: "[]",
        risks: jsonStringifyOr(defaultRisks,),
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
      atmosphere: defaultAtmosphere,
      equipment: [],
      risks: defaultRisks,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a location's NSFW config.
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
   */
  async getConfigs(locationIds: string[],): Promise<LocationNsfwConfig[]> {
    if (locationIds.length === 0) { return []; }

    const rows = await this.db
      .selectFrom("location_nsfw_config",)
      .where("location_id", "in", locationIds,)
      .selectAll()
      .execute();

    return Array.from(rows, (r,) => this.getRow(r,),);
  }

  /**
   * Delete a location's NSFW config.
   */
  async deleteConfig(locationId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("location_nsfw_config",)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }

  /**
   * Check if a location is suitable for NSFW encounters.
   */
  async isSuitableForEncounter(
    locationId: string,
    minPrivacy = "semi_private",
  ): Promise<{ suitable: boolean; reason?: string }> {
    const config = await this.getConfig(locationId,);

    const privacyOrder: Record<string, number> = {
      public: 0,
      semi_private: 1,
      private: 2,
      isolated: 3,
    };

    const configPrivacy = privacyOrder[config.privacyLevel] ?? 0;
    const requiredPrivacy = privacyOrder[minPrivacy] ?? 0;

    if (configPrivacy < requiredPrivacy) {
      return {
        suitable: false,
        reason: `Privacy too low: ${config.privacyLevel} (need ${minPrivacy})`,
      };
    }

    return { suitable: true, };
  }

  // ── Private helpers ───────────────────────────────────

  private getRow(row: {
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
  },): LocationNsfwConfig {
    return {
      id: row.id,
      locationId: row.location_id,
      locationType: row.location_type,
      privacyLevel: row.privacy_level,
      discoveryChance: row.discovery_chance,
      atmosphere: parseJsonField<LocationAtmosphere>(row.atmosphere, {
        romantic: 50,
        dangerous: 0,
        comfortable: 50,
        exotic: 0,
        seedy: 0,
      },),
      equipment: parseJsonField<string[]>(row.equipment, [],),
      risks: parseJsonField<LocationRisks>(row.risks, { discovery: 10, injury: 0, arrest: 0, reputation: 5, },),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
