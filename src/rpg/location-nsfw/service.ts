// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import type { DB, } from "../../db/schema";
import { LocationNsfwConfigStore, } from "./config-store";
import type {
  LocationAtmosphere,
  LocationNsfwConfig,
  UpdateLocationNsfwOpts,
} from "./types";

export type {
  LocationAtmosphere,
  LocationNsfwConfig,
  LocationRisks,
  UpdateLocationNsfwOpts,
} from "./types";

// ── Service ────────────────────────────────────────────────

/** */
export class LocationNsfwService {
  private readonly store: LocationNsfwConfigStore;

  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {
    this.store = new LocationNsfwConfigStore(db,);
  }

  /**
   * Get or create NSFW config for a location.
   * @param locationId
   */
  async getConfig(locationId: string,): Promise<LocationNsfwConfig> {
    return this.store.getConfig(locationId,);
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
    return this.store.updateConfig(locationId, updates,);
  }

  /**
   * Get NSFW configs for multiple locations.
   * @param locationIds
   */
  async getConfigs(locationIds: string[],): Promise<LocationNsfwConfig[]> {
    return this.store.getConfigs(locationIds,);
  }

  /**
   * Delete a location's NSFW config.
   * @param locationId
   */
  async deleteConfig(locationId: string,): Promise<boolean> {
    return this.store.deleteConfig(locationId,);
  }

  /**
   * Check if a location is suitable for NSFW encounters.
   * @param locationId
   * @param minPrivacy
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

  // ── Encounter-facing API (TASK-043) ───────────────────────

  /**
   * List world locations whose NSFW config clears a privacy minimum.
   *
   * Reads the canonical `locations` rows, then filters via the stored
   * NSFW config — suitability stays a config read, never a duplicate
   * housing query. Locations without a row get the bedroom/private
   * default through `getConfig`, so every canonical location resolves.
   * @param worldId
   * @param minPrivacy
   */
  async listAvailable(
    worldId: string,
    minPrivacy = "semi_private",
  ): Promise<LocationNsfwConfig[]> {
    const rows = await this.db
      .selectFrom("locations",)
      .where("world_id", "=", worldId,)
      .select("id",)
      .execute();
    const configs = await this.getConfigs(rows.map((row,) => row.id),);
    const byId = new Map(configs.map((config,) => [config.locationId, config,]),);
    const available: LocationNsfwConfig[] = [];
    for (const row of rows) {
      const config = byId.get(row.id,) ?? await this.getConfig(row.id,);
      const check = await this.isSuitableForEncounter(row.id, minPrivacy,);
      if (check.suitable) { available.push(config,); }
    }
    return available;
  }

  /**
   * Resolve the stored atmosphere scores for an encounter location.
   *
   * Thin alias over `getConfig().atmosphere`: encounter code calls one
   * entry point, and the weather-subscription adjustment (if any) lands
   * in exactly one place. No parallel weather cache — a future
   * `weather.changed` subscriber adjusts the stored config, not a copy.
   * @param locationId
   */
  async resolveAtmosphere(locationId: string,): Promise<LocationAtmosphere> {
    const config = await this.getConfig(locationId,);
    return config.atmosphere;
  }

  /**
   * Whether a location counts as private (private or isolated tier).
   * @param locationId
   */
  async isPrivate(locationId: string,): Promise<boolean> {
    const config = await this.getConfig(locationId,);
    return config.privacyLevel === "private" || config.privacyLevel === "isolated";
  }
}
