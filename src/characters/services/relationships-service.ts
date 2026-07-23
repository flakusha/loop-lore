/**
 * Character Relationships Service
 *
 * Manages inter-character relationships with standing, trust,
 * and familiarity metrics.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { RelationshipEventType, RelationshipType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";

/** Options for creating a relationship */
export interface CreateRelationshipOpts {
  actorId: string;
  targetActorId: string;
  worldId?: string;
  relationshipType: RelationshipType;
  standing?: number;
  trust?: number;
  familiarity?: number;
  isBidirectional?: boolean;
  metadata?: Record<string, unknown>;
}

/** Options for updating a relationship */
export interface UpdateRelationshipOpts {
  relationshipType?: RelationshipType;
  standing?: number;
  trust?: number;
  familiarity?: number;
  metadata?: Record<string, unknown>;
}

/** Options for logging a relationship event */
export interface LogRelationshipEventOpts {
  actorId: string;
  targetActorId: string;
  worldId?: string;
  eventType: RelationshipEventType;
  standingDelta?: number;
  trustDelta?: number;
  familiarityDelta?: number;
  metadata?: Record<string, unknown>;
}

/** Relationship with parsed metadata */
export interface Relationship {
  id: string;
  actorId: string;
  targetActorId: string;
  worldId: string | null;
  relationshipType: RelationshipType;
  standing: number;
  trust: number;
  familiarity: number;
  isBidirectional: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Character Relationships Service
 *
 * Manages bidirectional relationships between characters.
 * Standing ranges from -100 (hostile) to 100 (allied).
 * Trust ranges from -100 (distrust) to 100 (complete trust).
 * Familiarity ranges from 0 (stranger) to 100 (intimate).
 */
export class RelationshipsService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get all relationships for a character
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID to filter
   * @returns List of relationships
   */
  async getRelationships(actorId: string, worldId?: string,): Promise<Relationship[]> {
    const rows = await this.db
      .selectFrom("character_relationships",)
      .where("actor_id", "=", actorId,)
      .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
      .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
      .selectAll()
      .execute();

    return rows.map((row,) => this.rowToRelationship(row,));
  }

  /**
   * Get relationship between two characters
   * @param actorId - Source character actor ID
   * @param targetActorId - Target character actor ID
   * @param worldId - Optional world ID
   * @returns Relationship or undefined
   */
  async getRelationship(
    actorId: string,
    targetActorId: string,
    worldId?: string,
  ): Promise<Relationship | undefined> {
    const row = await this.db
      .selectFrom("character_relationships",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,)
      .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
      .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToRelationship(row,) : undefined;
  }

  /**
   * Create a relationship
   * @param opts - Relationship creation options
   * @returns Created relationship ID
   * @throws If relationship already exists
   */
  async createRelationship(opts: CreateRelationshipOpts,): Promise<string> {
    const existing = await this.getRelationship(opts.actorId, opts.targetActorId, opts.worldId,);
    if (existing) {
      throw new Error(
        `Relationship already exists between ${opts.actorId} and ${opts.targetActorId}`,
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("character_relationships",)
      .values({
        id,
        actor_id: opts.actorId,
        target_actor_id: opts.targetActorId,
        world_id: opts.worldId ?? null,
        relationship_type: opts.relationshipType,
        standing: opts.standing ?? 0,
        trust: opts.trust ?? 0,
        familiarity: opts.familiarity ?? 0,
        is_bidirectional: opts.isBidirectional ? 1 : 0,
        metadata: JSON.stringify(opts.metadata ?? {},),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    // Create reverse relationship if bidirectional
    if (opts.isBidirectional) {
      const reverseId = randomUUID();
      await this.db
        .insertInto("character_relationships",)
        .values({
          id: reverseId,
          actor_id: opts.targetActorId,
          target_actor_id: opts.actorId,
          world_id: opts.worldId ?? null,
          relationship_type: opts.relationshipType,
          standing: opts.standing ?? 0,
          trust: opts.trust ?? 0,
          familiarity: opts.familiarity ?? 0,
          is_bidirectional: 1,
          metadata: JSON.stringify(opts.metadata ?? {},),
          created_at: now,
          updated_at: now,
        },)
        .execute();
    }

    return id;
  }

  /**
   * Update a relationship
   * @param actorId - Source character actor ID
   * @param targetActorId - Target character actor ID
   * @param worldId - Optional world ID
   * @param opts - Update options
   */
  async updateRelationship(
    actorId: string,
    targetActorId: string,
    worldId: string | undefined,
    opts: UpdateRelationshipOpts,
  ): Promise<void> {
    const existing = await this.getRelationship(actorId, targetActorId, worldId,);
    if (!existing) {
      throw new Error(
        `Relationship not found between ${actorId} and ${targetActorId}`,
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (opts.relationshipType !== undefined) {
      updateData.relationship_type = opts.relationshipType;
    }
    if (opts.standing !== undefined) {
      updateData.standing = Math.max(-100, Math.min(100, opts.standing,),);
    }
    if (opts.trust !== undefined) {
      updateData.trust = Math.max(-100, Math.min(100, opts.trust,),);
    }
    if (opts.familiarity !== undefined) {
      updateData.familiarity = Math.max(0, Math.min(100, opts.familiarity,),);
    }
    if (opts.metadata !== undefined) {
      updateData.metadata = JSON.stringify(opts.metadata,);
    }

    await this.db
      .updateTable("character_relationships",)
      .set(updateData,)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,)
      .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
      .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
      .execute();

    // Update reverse if bidirectional
    if (existing.isBidirectional) {
      await this.db
        .updateTable("character_relationships",)
        .set(updateData,)
        .where("actor_id", "=", targetActorId,)
        .where("target_actor_id", "=", actorId,)
        .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
        .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
        .execute();
    }
  }

  /**
   * Delete a relationship
   * @param actorId - Source character actor ID
   * @param targetActorId - Target character actor ID
   * @param worldId - Optional world ID
   */
  async deleteRelationship(
    actorId: string,
    targetActorId: string,
    worldId?: string,
  ): Promise<void> {
    const existing = await this.getRelationship(actorId, targetActorId, worldId,);
    if (!existing) {
      throw new Error(
        `Relationship not found between ${actorId} and ${targetActorId}`,
      );
    }

    await this.db
      .deleteFrom("character_relationships",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,)
      .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
      .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
      .execute();

    // Delete reverse if bidirectional
    if (existing.isBidirectional) {
      await this.db
        .deleteFrom("character_relationships",)
        .where("actor_id", "=", targetActorId,)
        .where("target_actor_id", "=", actorId,)
        .$if(!!worldId, (qb,) => qb.where("world_id", "=", worldId!,),)
        .$if(!worldId, (qb,) => qb.where("world_id", "is", null,),)
        .execute();
    }
  }

  /**
   * Log a relationship event (applies standing/trust/familiarity changes)
   * @param opts - Event options
   */
  async logEvent(opts: LogRelationshipEventOpts,): Promise<void> {
    const relationship = await this.getRelationship(
      opts.actorId,
      opts.targetActorId,
      opts.worldId,
    );

    if (!relationship) {
      throw new Error(
        `Relationship not found between ${opts.actorId} and ${opts.targetActorId}`,
      );
    }

    // Apply deltas
    const updateOpts: UpdateRelationshipOpts = {};

    if (opts.standingDelta !== undefined) {
      updateOpts.standing = relationship.standing + opts.standingDelta;
    }
    if (opts.trustDelta !== undefined) {
      updateOpts.trust = relationship.trust + opts.trustDelta;
    }
    if (opts.familiarityDelta !== undefined) {
      updateOpts.familiarity = relationship.familiarity + opts.familiarityDelta;
    }
    if (opts.metadata !== undefined) {
      updateOpts.metadata = {
        ...relationship.metadata,
        ...opts.metadata,
        lastEvent: opts.eventType,
      };
    }

    await this.updateRelationship(
      opts.actorId,
      opts.targetActorId,
      opts.worldId,
      updateOpts,
    );
  }

  /**
   * Convert database row to Relationship object
   * @param row - Database row
   * @returns Relationship object
   */
  private rowToRelationship(row: {
    id: string;
    actor_id: string;
    target_actor_id: string;
    world_id: string | null;
    relationship_type: string;
    standing: number;
    trust: number;
    familiarity: number;
    is_bidirectional: number;
    metadata: string;
    created_at: string;
    updated_at: string;
  },): Relationship {
    return {
      id: row.id,
      actorId: row.actor_id,
      targetActorId: row.target_actor_id,
      worldId: row.world_id,
      relationshipType: row.relationship_type as RelationshipType,
      standing: row.standing,
      trust: row.trust,
      familiarity: row.familiarity,
      isBidirectional: row.is_bidirectional === 1,
      metadata: jsonParseOr(row.metadata, {},),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
