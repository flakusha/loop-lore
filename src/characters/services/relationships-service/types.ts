// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Relationships Service — types
 *
 * Shared types for relationship operations and the RelationshipsService
 * interface (single source of truth for the API shape).
 */
import type { Kysely, Selectable, } from "kysely";
import type { RelationshipEventType, RelationshipType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";

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

/** Raw DB row for a relationship — derived from the schema. */
export type RelationshipRow = Selectable<DB["character_relationships"]>;

/**
 * The full relationships service context handed to dispatchers as `thisL`.
 */
export type RelationshipsContext = RelationshipsService & { db: Kysely<DB> };

/**
 * Character Relationships Service — public API.
 */
export interface RelationshipsService {
  getRelationships(actorId: string, worldId?: string,): Promise<Relationship[]>;
  getRelationship(
    actorId: string,
    targetActorId: string,
    worldId?: string,
  ): Promise<Relationship | undefined>;
  createRelationship(opts: CreateRelationshipOpts,): Promise<string>;
  updateRelationship(
    actorId: string,
    targetActorId: string,
    worldId: string | undefined,
    opts: UpdateRelationshipOpts,
  ): Promise<void>;
  deleteRelationship(
    actorId: string,
    targetActorId: string,
    worldId?: string,
  ): Promise<void>;
  logEvent(opts: LogRelationshipEventOpts,): Promise<void>;
}
