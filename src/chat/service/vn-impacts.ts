// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN consequence write-back.
 *
 * Choice selections and question answers carry `relationship_impact` /
 * `mood_impact` maps. This module is the single place that pushes those
 * deltas into the character systems (`RelationshipsService` /
 * `MoodService`), get-or-creating the target rows so a first decision in a
 * fresh chat cannot throw for want of prior state.
 *
 * Canonical impact keys (everything else is reported as ignored):
 *   - relationship: `standing`, `trust`, `familiarity` — deltas on the
 *     (character actor -> acting user actor) pair of the chat.
 *   - mood: `happiness` — delta on every character actor in the chat,
 *     scaled by the row's stability via `applyHappinessDelta`.
 *
 * Question answers fold the chosen option's `emotion_modifier` /
 * `relationship_modifier` into the same deltas at the call site.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { MoodService, } from "../../characters/services/mood-service";
import { RelationshipsService, } from "../../characters/services/relationships-service";
import { RelationshipType as RelationshipTypeEnum, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";

/** Relationship dimensions a `relationship_impact` map may carry. */
const RELATIONSHIP_DIMENSIONS: readonly string[] = ["standing", "trust", "familiarity",];
/** Mood dimensions a `mood_impact` map may carry. */
const MOOD_DIMENSIONS: readonly string[] = ["happiness",];

/** Chat participants relevant to impact application. */
interface VnImpactTargets {
  worldId: string | undefined;
  characterActorIds: string[];
  /** Actor of the acting user; undefined when the user has no actor here. */
  userActorId: string | undefined;
}

/** Params for {@link applyVnImpacts}. */
export interface ApplyVnImpactsParams {
  chatId: string;
  /** User who selected/answered; resolves the user side of relationships. */
  actingUserId: string;
  relationshipImpact: Record<string, number>;
  moodImpact: Record<string, number>;
}

/** Result of {@link applyVnImpacts} — what was touched, and what was not. */
export interface ApplyVnImpactsResult {
  moodActorIds: string[];
  relationshipActorIds: string[];
  ignoredKeys: string[];
}

/** Params for {@link recordVnChoiceSelection}. */
export interface RecordVnChoiceSelectionParams {
  chatId: string;
  choiceId: string;
  sceneIndex: number;
  relationshipImpact: Record<string, number>;
  moodImpact: Record<string, number>;
  selectedBy: string;
}

/**
 * Keep only finite numbers under the allowed keys.
 * @param raw - raw impact map as stored on the row
 * @param allowed - canonical keys for this impact kind
 * @returns sanitized deltas plus the keys that were dropped
 */
export function sanitizeImpacts(
  raw: Record<string, number>,
  allowed: readonly string[],
): { deltas: Record<string, number>; ignored: string[] } {
  const deltas: Record<string, number> = {};
  const ignored: string[] = [];

  for (const [key, value,] of Object.entries(raw ?? {},)) {
    if (allowed.includes(key,) && Number.isFinite(value,)) {
      deltas[key] = value;
    } else {
      ignored.push(key,);
    }
  }

  return { deltas, ignored, };
}

/**
 * Resolve the chat's world and the actors impacts land on.
 * @param database
 * @param chatId
 * @param actingUserId
 * @returns targets, or null when the chat row is gone
 */
async function resolveImpactTargets(
  database: Kysely<DB>,
  chatId: string,
  actingUserId: string,
): Promise<VnImpactTargets | null> {
  const chat = await database
    .selectFrom("chats",)
    .select("world_id",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return null; }

  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["actors.id", "actors.actor_type", "actors.user_id",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const characterActorIds = participants
    .filter((p,) => p.actor_type === "character")
    .map((p,) => p.id);

  const userActorId = participants.find(
    (p,) => p.actor_type === "user" && p.user_id === actingUserId,
  )?.id;

  return { worldId: chat.world_id ?? undefined, characterActorIds, userActorId, };
}

/**
 * Apply the happiness delta to one actor, creating the mood row first when
 * the character has none yet (the mood service throws on a missing row).
 * @param database
 * @param actorId
 * @param worldId
 * @param delta
 */
async function applyMoodToActor(
  database: Kysely<DB>,
  actorId: string,
  worldId: string | undefined,
  delta: number,
): Promise<void> {
  const mood = MoodService(database,);
  const existing = await mood.getMood(actorId, worldId,);
  if (!existing) {
    await mood.createMood({ actorId, worldId, },);
  }

  await mood.applyHappinessDelta(actorId, worldId, delta,);
}

/**
 * Apply the relationship deltas for one (character -> user) pair, creating
 * the relationship first when the pair has no row yet (the relationships
 * service throws on a missing row). Values are stored as `existing + delta`;
 * the service clamps into its column ranges.
 * @param database
 * @param actorId - character side of the pair
 * @param targetActorId - acting user side of the pair
 * @param worldId
 * @param deltas - standing/trust/familiarity deltas
 */
async function applyRelationshipToActor(
  database: Kysely<DB>,
  actorId: string,
  targetActorId: string,
  worldId: string | undefined,
  deltas: Record<string, number>,
): Promise<void> {
  const relationships = RelationshipsService(database,);
  const existing = await relationships.getRelationship(actorId, targetActorId, worldId,);

  if (!existing) {
    await relationships.createRelationship({
      actorId,
      targetActorId,
      worldId,
      relationshipType: RelationshipTypeEnum.Neutral,
      standing: deltas.standing ?? 0,
      trust: deltas.trust ?? 0,
      familiarity: Math.max(0, deltas.familiarity ?? 0,),
    },);

    return;
  }

  await relationships.updateRelationship(actorId, targetActorId, worldId, {
    ...(deltas.standing !== undefined ? { standing: existing.standing + deltas.standing, } : {}),
    ...(deltas.trust !== undefined ? { trust: existing.trust + deltas.trust, } : {}),
    ...(deltas.familiarity !== undefined
      ? { familiarity: existing.familiarity + deltas.familiarity, }
      : {}),
  },);
}

/**
 * Fold one numeric option modifier into a copy of an impact map.
 * Non-finite modifiers are ignored; the input map is never mutated.
 * @param impact - base impact map from the question row
 * @param key - canonical dimension the modifier feeds
 * @param modifier - the chosen option's modifier
 * @returns a new map with the modifier folded in
 */
export function withOptionModifier(
  impact: Record<string, number>,
  key: string,
  modifier: number | undefined,
): Record<string, number> {
  const merged = { ...impact, };
  if (modifier !== undefined && Number.isFinite(modifier,)) {
    merged[key] = (merged[key] ?? 0) + modifier;
  }

  return merged;
}

/**
 * Apply a selection/answer's impacts to the character systems.
 *
 * Mood lands on every character actor of the chat; relationships land on the
 * (character -> acting user) pair. A chat without character actors or without
 * an actor for the acting user applies the subset that has targets and
 * reports the rest as skipped-by-shape (empty arrays), never throws.
 * @param database
 * @param root0
 * @param root0.chatId
 * @param root0.actingUserId
 * @param root0.relationshipImpact
 * @param root0.moodImpact
 * @returns the actors actually touched plus ignored impact keys
 */
export async function applyVnImpacts(
  database: Kysely<DB>,
  { chatId, actingUserId, relationshipImpact, moodImpact, }: ApplyVnImpactsParams,
): Promise<ApplyVnImpactsResult> {
  const moodImpacts = sanitizeImpacts(moodImpact, MOOD_DIMENSIONS,);
  const relationshipImpacts = sanitizeImpacts(relationshipImpact, RELATIONSHIP_DIMENSIONS,);
  const ignoredKeys = [...moodImpacts.ignored, ...relationshipImpacts.ignored,];
  const result: ApplyVnImpactsResult = {
    moodActorIds: [],
    relationshipActorIds: [],
    ignoredKeys,
  };

  const targets = await resolveImpactTargets(database, chatId, actingUserId,);
  if (!targets) { return result; }

  const happiness = moodImpacts.deltas.happiness;
  if (happiness !== undefined) {
    for (const actorId of targets.characterActorIds) {
      await applyMoodToActor(database, actorId, targets.worldId, happiness,);
      result.moodActorIds.push(actorId,);
    }
  }

  const hasRelationshipDeltas = RELATIONSHIP_DIMENSIONS.some(
    (key,) => relationshipImpacts.deltas[key] !== undefined,
  );

  if (hasRelationshipDeltas && targets.userActorId) {
    for (const actorId of targets.characterActorIds) {
      await applyRelationshipToActor(
        database,
        actorId,
        targets.userActorId,
        targets.worldId,
        relationshipImpacts.deltas,
      );

      result.relationshipActorIds.push(actorId,);
    }
  }

  if (ignoredKeys.length > 0) {
    getLogger().child({ module: "vn-impacts", },).debug(
      "Ignored non-canonical VN impact keys",
      { chatId, ignoredKeys, },
    );
  }

  return result;
}

/**
 * Persist the choice-history row for a selection. `applied_at` starts null;
 * {@link markVnChoiceSelectionApplied} stamps it once impacts landed.
 * @param database
 * @param root0
 * @param root0.chatId
 * @param root0.choiceId
 * @param root0.sceneIndex
 * @param root0.relationshipImpact
 * @param root0.moodImpact
 * @param root0.selectedBy
 * @returns the new selection row id
 */
export async function recordVnChoiceSelection(
  database: Kysely<DB>,
  { chatId, choiceId, sceneIndex, relationshipImpact, moodImpact, selectedBy, }: RecordVnChoiceSelectionParams,
): Promise<string> {
  const id = randomUUID();
  await database
    .insertInto("vn_choice_selections",)
    .values({
      id,
      chat_id: chatId,
      choice_id: choiceId,
      scene_index: sceneIndex,
      relationship_impact: jsonStringifyOr(relationshipImpact ?? {},),
      mood_impact: jsonStringifyOr(moodImpact ?? {},),
      selected_by: selectedBy,
      created_at: new Date().toISOString(),
    },)
    .execute();

  return id;
}

/**
 * Stamp a selection's impacts as applied.
 * @param database
 * @param selectionId
 * @returns the applied_at timestamp that was written
 */
export async function markVnChoiceSelectionApplied(
  database: Kysely<DB>,
  selectionId: string,
): Promise<string> {
  const appliedAt = new Date().toISOString();
  await database
    .updateTable("vn_choice_selections",)
    .set({ applied_at: appliedAt, },)
    .where("id", "=", selectionId,)
    .execute();

  return appliedAt;
}

/**
 * Stamp a question's impacts as applied (mirrors the selection stamp).
 * @param database
 * @param questionId
 * @returns the applied_at timestamp that was written
 */
export async function markVnQuestionApplied(
  database: Kysely<DB>,
  questionId: string,
): Promise<string> {
  const appliedAt = new Date().toISOString();
  await database
    .updateTable("vn_questions",)
    .set({ applied_at: appliedAt, },)
    .where("id", "=", questionId,)
    .execute();

  return appliedAt;
}
