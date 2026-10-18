// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chat/service/vn-impacts.ts — consequence write-back into the
 * character systems.
 *
 * Observable state, not echoes: every case reads `character_mood` /
 * `character_relationships` / `vn_choice_selections` rows back after the call.
 * The get-or-create path is the point — `updateMood`/`updateRelationship`
 * throw on a missing row, so a first decision in a fresh chat must create.
 */
import { describe, expect, test, } from "bun:test";
import { MoodService, } from "../../characters/services/mood-service";
import { RelationshipsService, } from "../../characters/services/relationships-service";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterRelationships,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertVnChoices,
  insertVnQuestions,
} from "../../test-utils/insert-helpers";
import {
  applyVnImpacts,
  markVnChoiceSelectionApplied,
  markVnQuestionApplied,
  recordVnChoiceSelection,
  sanitizeImpacts,
  withOptionModifier,
} from "./vn-impacts";

describe("sanitizeImpacts", () => {
  test("keeps only allowed finite numbers and reports the rest", () => {
    const { deltas, ignored, } = sanitizeImpacts(
      { standing: 10, karma: 5, trust: Number.NaN, },
      ["standing", "trust", "familiarity",],
    );

    expect(deltas,).toEqual({ standing: 10, },);
    expect(ignored.sort((a, b,) => a.localeCompare(b,)),).toEqual(["karma", "trust",],);
  });

  test("tolerates a missing map", () => {
    expect(sanitizeImpacts(undefined as never, ["happiness",],),).toEqual({
      deltas: {},
      ignored: [],
    },);
  });
});

describe("withOptionModifier", () => {
  test("folds the modifier into a copy without mutating the input", () => {
    const base = { standing: 5, };
    const merged = withOptionModifier(base, "standing", 10,);

    expect(merged,).toEqual({ standing: 15, },);
    expect(base,).toEqual({ standing: 5, },);
  });

  test("ignores non-finite modifiers and creates missing keys", () => {
    expect(withOptionModifier({}, "happiness", Number.NaN,),).toEqual({},);
    expect(withOptionModifier({}, "happiness", 7,),).toEqual({ happiness: 7, },);
    expect(withOptionModifier({}, "happiness", undefined,),).toEqual({},);
  });
});

describe("applyVnImpacts", () => {
  /** Seed owner-user + character actors as chat participants; return ids. */
  async function seedChat(): Promise<{
    db: import("kysely").Kysely<import("../../db/schema").DB>;
    ownerId: string;
    characterActorId: string;
    chatId: string;
  }> {
    const { db, } = await createTestDb();
    const ownerId = await insertUsers(db, "owner", "Owner", {} as never,);
    const ownerActorId = await insertActors(db, "Owner", {
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);

    const characterActorId = await insertActors(db, "Mira", {
      actor_type: "character",
    } as never,);

    const chatId = await insertChats(db, "VN chat", ownerId, {
      type: "group",
      mode: "vn",
    } as never,);

    await insertChatParticipants(db, chatId, ownerActorId, {} as never,);
    await insertChatParticipants(db, chatId, characterActorId, {} as never,);

    return { db, ownerId, characterActorId, chatId, };
  }

  test("creates mood and relationship rows when the character has none", async () => {
    const { db, ownerId, characterActorId, chatId, } = await seedChat();

    const applied = await applyVnImpacts(db, {
      chatId,
      actingUserId: ownerId,
      relationshipImpact: { standing: 10, trust: -5, familiarity: 4, },
      moodImpact: { happiness: 10, },
    },);

    expect(applied.moodActorIds,).toEqual([characterActorId,],);
    expect(applied.relationshipActorIds,).toEqual([characterActorId,],);

    const mood = MoodService(db,).getMood(characterActorId, undefined,);
    // createMood defaults happiness to 50 and stability to 0.5, so the delta
    // lands scaled: 50 + 10 * (1 - 0.5*0.5) = 57.5.
    expect((await mood)?.happiness,).toBeCloseTo(57.5, 5,);

    const userActorId = (await db
      .selectFrom("chat_participants",)
      .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
      .select("actors.id",)
      .where("chat_participants.chat_id", "=", chatId,)
      .where("actors.user_id", "=", ownerId,)
      .executeTakeFirstOrThrow()).id;

    const relationship = await RelationshipsService(db,).getRelationship(
      characterActorId,
      userActorId,
      undefined,
    );

    expect(relationship?.standing,).toBe(10,);
    expect(relationship?.trust,).toBe(-5,);
    expect(relationship?.familiarity,).toBe(4,);

    await db.destroy();
  });

  test("increments existing rows instead of throwing on them", async () => {
    const { db, ownerId, characterActorId, chatId, } = await seedChat();
    const mood = MoodService(db,);
    await mood.createMood({ actorId: characterActorId, happiness: 60, moodStability: 0, },);

    const userActorId = (await db
      .selectFrom("chat_participants",)
      .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
      .select("actors.id",)
      .where("chat_participants.chat_id", "=", chatId,)
      .where("actors.user_id", "=", ownerId,)
      .executeTakeFirstOrThrow()).id;

    await insertCharacterRelationships(
      db,
      characterActorId,
      userActorId,
      "neutral" as never,
      new Date().toISOString(),
      new Date().toISOString(),
      { standing: 20, trust: 0, familiarity: 10, },
    );

    const applied = await applyVnImpacts(db, {
      chatId,
      actingUserId: ownerId,
      relationshipImpact: { standing: 10, trust: 15, familiarity: 5, },
      moodImpact: { happiness: 10, },
    },);

    expect(applied.moodActorIds,).toEqual([characterActorId,],);

    // Stability 0 → the full delta lands.
    expect((await mood.getMood(characterActorId, undefined,))?.happiness,).toBe(70,);

    const relationship = await RelationshipsService(db,).getRelationship(
      characterActorId,
      userActorId,
      undefined,
    );

    expect(relationship?.standing,).toBe(30,);
    expect(relationship?.trust,).toBe(15,);
    expect(relationship?.familiarity,).toBe(15,);

    await db.destroy();
  });

  test("applies mood without relationship targets when the user has no actor", async () => {
    const { db, characterActorId, chatId, } = await seedChat();
    const outsiderId = await insertUsers(db, "outsider", "Outsider", {} as never,);

    const applied = await applyVnImpacts(db, {
      chatId,
      actingUserId: outsiderId,
      relationshipImpact: { standing: 10, },
      moodImpact: { happiness: -20, karma: 3, },
    },);

    expect(applied.moodActorIds,).toEqual([characterActorId,],);
    expect(applied.relationshipActorIds,).toEqual([],);
    expect(applied.ignoredKeys,).toEqual(["karma",],);

    // Mood landed (created at 50, -20 * 0.75 = -15).
    expect(
      (await MoodService(db,).getMood(characterActorId, undefined,))?.happiness,
    ).toBeCloseTo(35, 5,);

    // No relationship row was invented for the actor-less user.
    const rels = await db.selectFrom("character_relationships",).selectAll().execute();
    expect(rels,).toHaveLength(0,);

    await db.destroy();
  });

  test("no character participants means nothing is applied", async () => {
    const { db, } = await createTestDb();
    const ownerId = await insertUsers(db, "solo", "Solo", {} as never,);
    const actorId = await insertActors(db, "Solo", {
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);

    const chatId = await insertChats(db, "No cast", ownerId, {
      type: "group",
      mode: "vn",
    } as never,);

    await insertChatParticipants(db, chatId, actorId, {} as never,);

    const applied = await applyVnImpacts(db, {
      chatId,
      actingUserId: ownerId,
      relationshipImpact: { standing: 10, },
      moodImpact: { happiness: 10, },
    },);

    expect(applied.moodActorIds,).toEqual([],);
    expect(applied.relationshipActorIds,).toEqual([],);

    expect(await db.selectFrom("character_mood",).selectAll().execute(),).toHaveLength(0,);
    await db.destroy();
  });
});

describe("selection history + applied stamps", () => {
  test("recordVnChoiceSelection persists the impact payload and stamps apply", async () => {
    const { db, } = await createTestDb();
    const ownerId = await insertUsers(db, "owner", "Owner", {} as never,);
    const chatId = await insertChats(db, "VN chat", ownerId, {
      type: "group",
      mode: "vn",
    } as never,);

    const choiceId = await insertVnChoices(
      db,
      chatId,
      2,
      "Open the gate",
      new Date().toISOString(),
      { relationship_impact: JSON.stringify({ standing: 8, },), },
    );

    const selectionId = await recordVnChoiceSelection(db, {
      chatId,
      choiceId,
      sceneIndex: 2,
      relationshipImpact: { standing: 8, },
      moodImpact: { happiness: -5, },
      selectedBy: ownerId,
    },);

    const row = await db.selectFrom("vn_choice_selections",).selectAll()
      .where("id", "=", selectionId,).executeTakeFirstOrThrow();

    expect(row.chat_id,).toBe(chatId,);
    expect(row.choice_id,).toBe(choiceId,);
    expect(row.scene_index,).toBe(2,);
    expect(row.selected_by,).toBe(ownerId,);
    expect(row.applied_at,).toBeNull();
    expect(JSON.parse(row.relationship_impact,),).toEqual({ standing: 8, },);
    expect(JSON.parse(row.mood_impact,),).toEqual({ happiness: -5, },);

    const appliedAt = await markVnChoiceSelectionApplied(db, selectionId,);
    expect(appliedAt,).toBeTruthy();
    const stamped = await db.selectFrom("vn_choice_selections",).select("applied_at",)
      .where("id", "=", selectionId,).executeTakeFirstOrThrow();

    expect(stamped.applied_at,).toBe(appliedAt,);

    await db.destroy();
  });

  test("markVnQuestionApplied stamps vn_questions.applied_at", async () => {
    const { db, } = await createTestDb();
    const ownerId = await insertUsers(db, "owner", "Owner", {} as never,);
    const chatId = await insertChats(db, "VN chat", ownerId, {
      type: "group",
      mode: "vn",
    } as never,);

    const questionId = await insertVnQuestions(
      db,
      chatId,
      1,
      "Why here?",
      new Date().toISOString(),
      {},
    );

    const appliedAt = await markVnQuestionApplied(db, questionId,);
    const row = await db.selectFrom("vn_questions",).select("applied_at",)
      .where("id", "=", questionId,).executeTakeFirstOrThrow();

    expect(row.applied_at,).toBe(appliedAt,);

    await db.destroy();
  });
});
