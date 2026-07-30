/**
 * World & Location Traits Service
 *
 * Layer 2 (world) and Layer 3 (location) trait management for characters.
 * World traits apply per-world bonuses/penalties; location traits are
 * more granular per-location effects with equipment overrides.
 */
import type { Kysely, } from "kysely";
import { uid, } from "../../utils.js";

// ── Types ────────────────────────────────────────────────
export type WorldTraitCategory =
  | "environmental"
  | "cultural"
  | "magical"
  | "technological"
  | "political"
  | "economic";

export interface WorldTraitRow {
  id: string;
  actor_id: string;
  world_id: string;
  trait_category: WorldTraitCategory;
  trait_name: string;
  trait_value: string;
  created_at: string;
  updated_at: string;
}

export interface LocationTraitRow {
  id: string;
  actor_id: string;
  location_id: string;
  trait_name: string;
  trait_value: string;
  bonus: number;
  penalty: number;
  effects: string;
  equipment_override: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorldTraitInput {
  actor_id: string;
  world_id: string;
  trait_category: WorldTraitCategory;
  trait_name: string;
  trait_value: string;
}

export interface UpdateWorldTraitInput {
  trait_category?: WorldTraitCategory;
  trait_name?: string;
  trait_value?: string;
}

export interface CreateLocationTraitInput {
  actor_id: string;
  location_id: string;
  trait_name: string;
  trait_value: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
  equipment_override?: Record<string, unknown>;
}

export interface UpdateLocationTraitInput {
  trait_name?: string;
  trait_value?: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
  equipment_override?: Record<string, unknown>;
}

// ── Service ──────────────────────────────────────────────
export class WorldLocationTraitsService {
  constructor(private readonly db: Kysely<any>,) {}

  // ── World Traits (Layer 2) ───────────────────────────
  async createWorldTrait(
    input: CreateWorldTraitInput,
  ): Promise<WorldTraitRow> {
    const id = uid();
    const now = new Date().toISOString();
    const trait = {
      id,
      actor_id: input.actor_id,
      world_id: input.world_id,
      trait_category: input.trait_category,
      trait_name: input.trait_name,
      trait_value: input.trait_value,
      created_at: now,
      updated_at: now,
    };

    await this.db
      .insertInto("character_world_traits",)
      .values(trait,)
      .execute();

    return trait;
  }

  async getWorldTraits(
    actorId: string,
    worldId: string,
  ): Promise<WorldTraitRow[]> {
    return this.db
      .selectFrom("character_world_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .orderBy("trait_category", "asc",)
      .execute() as Promise<WorldTraitRow[]>;
  }

  async updateWorldTrait(
    id: string,
    input: UpdateWorldTraitInput,
  ): Promise<WorldTraitRow | undefined> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.trait_category !== undefined) {
      updates.trait_category = input.trait_category;
    }
    if (input.trait_name !== undefined) { updates.trait_name = input.trait_name; }
    if (input.trait_value !== undefined) { updates.trait_value = input.trait_value; }

    const result = await this.db
      .updateTable("character_world_traits",)
      .set(updates,)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

    return this.db
      .selectFrom("character_world_traits",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst() as Promise<WorldTraitRow | undefined>;
  }

  async deleteWorldTrait(id: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("character_world_traits",)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0,) > 0;
  }

  // ── Location Traits (Layer 3) ────────────────────────
  async createLocationTrait(
    input: CreateLocationTraitInput,
  ): Promise<LocationTraitRow> {
    const id = uid();
    const now = new Date().toISOString();
    const trait = {
      id,
      actor_id: input.actor_id,
      location_id: input.location_id,
      trait_name: input.trait_name,
      trait_value: input.trait_value,
      bonus: input.bonus ?? 0,
      penalty: input.penalty ?? 0,
      effects: JSON.stringify(input.effects ?? {},),
      equipment_override: JSON.stringify(input.equipment_override ?? {},),
      created_at: now,
      updated_at: now,
    };

    await this.db
      .insertInto("character_location_traits",)
      .values(trait,)
      .execute();

    return trait;
  }

  async getLocationTraits(
    actorId: string,
    locationId: string,
  ): Promise<LocationTraitRow[]> {
    return this.db
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .execute() as Promise<LocationTraitRow[]>;
  }

  async updateLocationTrait(
    id: string,
    input: UpdateLocationTraitInput,
  ): Promise<LocationTraitRow | undefined> {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.trait_name !== undefined) { updates.trait_name = input.trait_name; }
    if (input.trait_value !== undefined) { updates.trait_value = input.trait_value; }
    if (input.bonus !== undefined) { updates.bonus = input.bonus; }
    if (input.penalty !== undefined) { updates.penalty = input.penalty; }
    if (input.effects !== undefined) {
      updates.effects = JSON.stringify(input.effects,);
    }
    if (input.equipment_override !== undefined) {
      updates.equipment_override = JSON.stringify(input.equipment_override,);
    }

    const result = await this.db
      .updateTable("character_location_traits",)
      .set(updates,)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

    return this.db
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst() as Promise<LocationTraitRow | undefined>;
  }

  async deleteLocationTrait(id: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("character_location_traits",)
      .where("id", "=", id,)
      .executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0,) > 0;
  }

  // ── Aggregate queries ────────────────────────────────
  async getAllTraitsForActor(
    actorId: string,
  ): Promise<{
    worldTraits: WorldTraitRow[];
    locationTraits: LocationTraitRow[];
  }> {
    const worldTraits = (await this.db
      .selectFrom("character_world_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .execute()) as WorldTraitRow[];

    const locationTraits = (await this.db
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .execute()) as LocationTraitRow[];

    return { worldTraits, locationTraits, };
  }
}
