import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { jsonStringifyOr, } from "../../../utils";
import { parseJsonField, } from "./playthrough";
import type { EndingType, MetaProgression, PermanentBonus, } from "./types";

/** Get meta-progression for a player */
export async function getMetaProgression(
  db: Kysely<DB>,
  playerId: string,
): Promise<MetaProgression> {
  const row = await (db as any)
    .selectFrom("meta_progression",)
    .where("player_id", "=", playerId,)
    .selectAll()
    .executeTakeFirst();

  if (!row) {
    return {
      playerId,
      totalPlaythroughs: 0,
      endingsSeen: [],
      secretsFound: [],
      achievementsUnlocked: [],
      permanentBonuses: [],
      unlockedContent: [],
      metadata: {},
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    playerId: row.player_id,
    totalPlaythroughs: row.total_playthroughs,
    endingsSeen: parseJsonField<string[]>(row.endings_seen, [],),
    secretsFound: parseJsonField<string[]>(row.secrets_found, [],),
    achievementsUnlocked: parseJsonField<string[]>(row.achievements_unlocked, [],),
    permanentBonuses: parseJsonField<PermanentBonus[]>(row.permanent_bonuses, [],),
    unlockedContent: parseJsonField<string[]>(row.unlocked_content, [],),
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    updatedAt: row.updated_at,
  };
}

/**
 * Update meta-progression after completing a playthrough
 */
export async function updateMetaProgression(
  db: Kysely<DB>,
  playerId: string,
  endingId: string,
  _endingType: EndingType,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getMetaProgression(db, playerId,);

  const endingsSeen = existing.endingsSeen.includes(endingId,)
    ? existing.endingsSeen
    : [...existing.endingsSeen, endingId,];

  const metaProgressionData = {
    player_id: playerId,
    total_playthroughs: existing.totalPlaythroughs + 1,
    endings_seen: jsonStringifyOr(endingsSeen,),
    secrets_found: jsonStringifyOr(existing.secretsFound,),
    achievements_unlocked: jsonStringifyOr(existing.achievementsUnlocked,),
    permanent_bonuses: jsonStringifyOr(existing.permanentBonuses,),
    unlocked_content: jsonStringifyOr(existing.unlockedContent,),
    metadata: jsonStringifyOr(existing.metadata,),
    updated_at: now,
  };

  // Upsert meta-progression
  const existingRow = await (db as any)
    .selectFrom("meta_progression",)
    .where("player_id", "=", playerId,)
    .select("player_id",)
    .executeTakeFirst();

  if (existingRow) {
    await (db as any)
      .updateTable("meta_progression",)
      .set(metaProgressionData,)
      .where("player_id", "=", playerId,)
      .execute();
  } else {
    await (db as any)
      .insertInto("meta_progression",)
      .values(metaProgressionData,)
      .execute();
  }
}
