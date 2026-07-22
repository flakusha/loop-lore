/**
 * Character Traits Service
 *
 * Manages permanent traits (Layer 0), world traits (Layer 2),
 * and location traits (Layer 3) for characters.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type {
  TraitCategory,
  WorldTraitCategory,
} from "../../db/enums";
import type { DB, } from "../../db/schema";

/** Options for creating a permanent trait */
export interface CreatePermanentTraitOpts {
  actorId: string;
  category: TraitCategory;
  name: string;
  value: string;
}

/** Options for creating a world trait */
export interface CreateWorldTraitOpts {
  actorId: string;
  worldId: string;
  category: WorldTraitCategory;
  name: string;
  value: string;
}

/** Options for creating a location trait */
export interface CreateLocationTraitOpts {
  actorId: string;
  locationId: string;
  name: string;
  value: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
}

/** Options for updating a permanent trait */
export interface UpdatePermanentTraitOpts {
  name: string;
  value: string;
}

/** Options for updating a world trait */
export interface UpdateWorldTraitOpts {
  name: string;
  value: string;
}

/** Options for updating a location trait */
export interface UpdateLocationTraitOpts {
  name: string;
  value: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
}

/**
 * Character Traits Service
 *
 * Manages immutable permanent traits, per-world traits,
 * and per-location traits for characters.
 */
export class TraitsService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Permanent Traits (Layer 0) ──────────────────────────

  /**
   * Get all permanent traits for a character
   * @param actorId - Character actor ID
   * @returns List of permanent traits
   */
  async getPermanentTraits(actorId: string,) {
    return this.db
      .selectFrom("character_permanent_traits",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();
  }

  /**
   * Get a permanent trait by name
   * @param actorId - Character actor ID
   * @param name - Trait name
   * @returns Trait or undefined
   */
  async getPermanentTrait(actorId: string, name: string,) {
    return this.db
      .selectFrom("character_permanent_traits",)
      .where("actor_id", "=", actorId,)
      .where("trait_name", "=", name,)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Create a permanent trait
   * @param opts - Trait creation options
   * @returns Created trait ID
   * @throws If trait already exists for this actor
   */
  async createPermanentTrait(opts: CreatePermanentTraitOpts,): Promise<string> {
    const existing = await this.getPermanentTrait(opts.actorId, opts.name,);
    if (existing) {
      throw new Error(`Permanent trait "${opts.name}" already exists for actor ${opts.actorId}`,);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("character_permanent_traits",)
      .values({
        id,
        actor_id: opts.actorId,
        trait_category: opts.category,
        trait_name: opts.name,
        trait_value: opts.value,
        immutable: 1,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  /**
   * Update a permanent trait value
   * @param actorId - Character actor ID
   * @param opts - Update options
   * @throws If trait doesn't exist
   */
  async updatePermanentTrait(actorId: string, opts: UpdatePermanentTraitOpts,): Promise<void> {
    const existing = await this.getPermanentTrait(actorId, opts.name,);
    if (!existing) {
      throw new Error(`Permanent trait "${opts.name}" not found for actor ${actorId}`,);
    }

    await this.db
      .updateTable("character_permanent_traits",)
      .set({
        trait_value: opts.value,
        updated_at: new Date().toISOString(),
      },)
      .where("actor_id", "=", actorId,)
      .where("trait_name", "=", opts.name,)
      .execute();
  }

  /**
   * Delete a permanent trait
   * @param actorId - Character actor ID
   * @param name - Trait name
   */
  async deletePermanentTrait(actorId: string, name: string,): Promise<void> {
    await this.db
      .deleteFrom("character_permanent_traits",)
      .where("actor_id", "=", actorId,)
      .where("trait_name", "=", name,)
      .execute();
  }

  // ── World Traits (Layer 2) ──────────────────────────────

  /**
   * Get all world traits for a character in a specific world
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @returns List of world traits
   */
  async getWorldTraits(actorId: string, worldId: string,) {
    return this.db
      .selectFrom("character_world_traits",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .selectAll()
      .execute();
  }

  /**
   * Get a world trait by name
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @param name - Trait name
   * @returns Trait or undefined
   */
  async getWorldTrait(actorId: string, worldId: string, name: string,) {
    return this.db
      .selectFrom("character_world_traits",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("trait_name", "=", name,)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Create a world trait
   * @param opts - Trait creation options
   * @returns Created trait ID
   * @throws If trait already exists for this actor+world
   */
  async createWorldTrait(opts: CreateWorldTraitOpts,): Promise<string> {
    const existing = await this.getWorldTrait(opts.actorId, opts.worldId, opts.name,);
    if (existing) {
      throw new Error(`World trait "${opts.name}" already exists for actor ${opts.actorId} in world ${opts.worldId}`,);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("character_world_traits",)
      .values({
        id,
        actor_id: opts.actorId,
        world_id: opts.worldId,
        trait_category: opts.category,
        trait_name: opts.name,
        trait_value: opts.value,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  /**
   * Update a world trait value
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @param opts - Update options
   */
  async updateWorldTrait(actorId: string, worldId: string, opts: UpdateWorldTraitOpts,): Promise<void> {
    const existing = await this.getWorldTrait(actorId, worldId, opts.name,);
    if (!existing) {
      throw new Error(`World trait "${opts.name}" not found for actor ${actorId} in world ${worldId}`,);
    }

    await this.db
      .updateTable("character_world_traits",)
      .set({
        trait_value: opts.value,
        updated_at: new Date().toISOString(),
      },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("trait_name", "=", opts.name,)
      .execute();
  }

  /**
   * Delete a world trait
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @param name - Trait name
   */
  async deleteWorldTrait(actorId: string, worldId: string, name: string,): Promise<void> {
    await this.db
      .deleteFrom("character_world_traits",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("trait_name", "=", name,)
      .execute();
  }

  // ── Location Traits (Layer 3) ───────────────────────────

  /**
   * Get all location traits for a character at a specific location
   * @param actorId - Character actor ID
   * @param locationId - Location ID
   * @returns List of location traits
   */
  async getLocationTraits(actorId: string, locationId: string,) {
    return this.db
      .selectFrom("character_location_traits",)
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .selectAll()
      .execute();
  }

  /**
   * Get a location trait by name
   * @param actorId - Character actor ID
   * @param locationId - Location ID
   * @param name - Trait name
   * @returns Trait or undefined
   */
  async getLocationTrait(actorId: string, locationId: string, name: string,) {
    return this.db
      .selectFrom("character_location_traits",)
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .where("trait_name", "=", name,)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Create a location trait
   * @param opts - Trait creation options
   * @returns Created trait ID
   * @throws If trait already exists for this actor+location
   */
  async createLocationTrait(opts: CreateLocationTraitOpts,): Promise<string> {
    const existing = await this.getLocationTrait(opts.actorId, opts.locationId, opts.name,);
    if (existing) {
      throw new Error(
        `Location trait "${opts.name}" already exists for actor ${opts.actorId} at location ${opts.locationId}`,
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("character_location_traits",)
      .values({
        id,
        actor_id: opts.actorId,
        location_id: opts.locationId,
        trait_name: opts.name,
        trait_value: opts.value,
        bonus: opts.bonus ?? 0,
        penalty: opts.penalty ?? 0,
        effects: JSON.stringify(opts.effects ?? {},),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  /**
   * Update a location trait
   * @param actorId - Character actor ID
   * @param locationId - Location ID
   * @param opts - Update options
   */
  async updateLocationTrait(actorId: string, locationId: string, opts: UpdateLocationTraitOpts,): Promise<void> {
    const existing = await this.getLocationTrait(actorId, locationId, opts.name,);
    if (!existing) {
      throw new Error(`Location trait "${opts.name}" not found for actor ${actorId} at location ${locationId}`,);
    }

    await this.db
      .updateTable("character_location_traits",)
      .set({
        trait_value: opts.value,
        bonus: opts.bonus ?? existing.bonus,
        penalty: opts.penalty ?? existing.penalty,
        effects: opts.effects ? JSON.stringify(opts.effects,) : existing.effects,
        updated_at: new Date().toISOString(),
      },)
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .where("trait_name", "=", opts.name,)
      .execute();
  }

  /**
   * Delete a location trait
   * @param actorId - Character actor ID
   * @param locationId - Location ID
   * @param name - Trait name
   */
  async deleteLocationTrait(actorId: string, locationId: string, name: string,): Promise<void> {
    await this.db
      .deleteFrom("character_location_traits",)
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", locationId,)
      .where("trait_name", "=", name,)
      .execute();
  }

  // ── Bulk Operations ─────────────────────────────────────

  /**
   * Get all traits for a character across all layers
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID to filter world traits
   * @param locationId - Optional location ID to filter location traits
   * @returns Combined traits object
   */
  async getAllTraits(actorId: string, worldId?: string, locationId?: string,) {
    const permanent = await this.getPermanentTraits(actorId,);

    const world = worldId
      ? await this.getWorldTraits(actorId, worldId,)
      : [];

    const location = locationId
      ? await this.getLocationTraits(actorId, locationId,)
      : [];

    return { permanent, world, location, };
  }
}
