// src/characters/importers/character-systems/relationships.ts — Import relationship data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { RelationshipsService, } from "../../services/relationships-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Import relationships into the character systems importer result. */
export async function importRelationships(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["relationships"],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  if (!data) { return; }
  const relationshipsService = RelationshipsService(db,);

  for (const rel of data) {
    try {
      const existing = await relationshipsService.getRelationship(
        actorId,
        rel.targetActorId as string,
        worldId,
      );
      if (existing) {
        await relationshipsService.updateRelationship(actorId, rel.targetActorId as string, worldId, {
          relationshipType: rel.relationshipType as any,
          standing: rel.standing as number,
          trust: rel.trust as number,
          familiarity: rel.familiarity as number,
          metadata: rel.metadata as Record<string, unknown>,
        },);
      } else {
        await relationshipsService.createRelationship({
          actorId,
          targetActorId: rel.targetActorId as string,
          worldId,
          relationshipType: rel.relationshipType as any,
          standing: rel.standing as number,
          trust: rel.trust as number,
          familiarity: rel.familiarity as number,
          isBidirectional: rel.isBidirectional as boolean,
          metadata: rel.metadata as Record<string, unknown>,
        },);
      }
      result.relationshipsImported++;
    } catch (error: unknown) {
      result.errors.push(`Failed to import relationship with "${String(rel.targetActorId,)}": ${errMsg(error,)}`,);
    }
  }
}
