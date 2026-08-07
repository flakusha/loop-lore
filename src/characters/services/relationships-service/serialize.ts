/**
 * Relationships Service — row serialization helper
 */
import { jsonParseOr, } from "../../../utils";
import type { Relationship, RelationshipRow, } from "./types";

/**
 * Convert a database row to a {@link Relationship} object.
 *
 * @param row - Database row
 * @returns Relationship object
 */
export function rowToRelationship(row: RelationshipRow,): Relationship {
  return {
    id: row.id,
    actorId: row.actor_id,
    targetActorId: row.target_actor_id,
    worldId: row.world_id,
    relationshipType: row.relationship_type,
    standing: row.standing,
    trust: row.trust,
    familiarity: row.familiarity,
    isBidirectional: row.is_bidirectional === 1,
    metadata: jsonParseOr(row.metadata ?? "{}", {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
