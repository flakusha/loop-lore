// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the guarded VN questions endpoints under `/api/v1`.
 *
 * Mirrors vn-choices.test.ts. The IDOR properties asserted here are the point:
 * a non-participant is told not_found (not forbidden, which would confirm the
 * chat exists), and a question id belonging to ANOTHER chat is rejected
 * rather than answered.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertVnQuestions,
} from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./index";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();
const OTHER_CHAT_ID = randomUUID();

/** Build chatsRoutes with the v1 prefix (FE contract) under a test auth derive. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole: "member", }))
    .use(chatsRoutes({ database: db, config, }, "/api/v1",),);
}

const OPTIONS_JSON = JSON.stringify([
  { id: "o1", text: "I opened it", emotion_modifier: 5, relationship_modifier: 10, },
  { id: "o2", text: "Someone else did", emotion_modifier: -5, relationship_modifier: -10, },
],);

/** Ids of the two seeded questions, populated by seed(). */
interface SeededIds {
  mine: string;
  other: string;
}

/**
 * Seed owner + participant + outsider users/actors, an owner-owned chat with
 * the participant added, a second chat owned by the participant, and one
 * available question per chat at scene 0.
 * @param db
 * @param questionIds
 */
async function seed(db: Kysely<DB>, questionIds: SeededIds,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `participant-${PARTICIPANT_ID}`, "Participant", { id: PARTICIPANT_ID, } as never,);
  await insertActors(
    db,
    "Participant",
    { id: PARTICIPANT_ID, user_id: PARTICIPANT_ID, owner_id: PARTICIPANT_ID, } as never,
  );

  await insertUsers(db, `outsider-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "Outsider", { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,);

  await insertChats(db, "VN Chat", OWNER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "vn",
  } as never,);

  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, {} as never,);

  await insertChats(db, "Other Chat", PARTICIPANT_ID, {
    id: OTHER_CHAT_ID,
    type: "group",
    mode: "vn",
  } as never,);

  questionIds.mine = await insertVnQuestions(db, CHAT_ID, 0, "Who opened the door?", new Date().toISOString(), {
    speaker_id: "Ada",
    options: OPTIONS_JSON,
    relationship_impact: JSON.stringify({ ada: 10, },),
    mood_impact: JSON.stringify({ wary: 5, },),
    status: "available",
  },);

  questionIds.other = await insertVnQuestions(db, OTHER_CHAT_ID, 0, "Belongs elsewhere", new Date().toISOString(), {
    options: OPTIONS_JSON,
    status: "available",
  },);
}

/** Fresh id bag for each test. */
function ids(): SeededIds {
  return { mine: "", other: "", };
}

describe("guarded VN questions routes under /api/v1", () => {
  test("participant lists questions at GET /api/v1/chats/:id/vn-questions", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      questions: {
        id: string;
        question_text: string;
        speaker_id: string | null;
        scene_index: number;
        status: string;
        relationship_impact: Record<string, number>;
        options: { id: string; text: string; relationship_modifier: number }[];
      }[];
    };

    expect(Array.isArray(body.questions,),).toBe(true,);
    expect(body.questions,).toHaveLength(1,);
    expect(body.questions[0]!.id,).toBe(questionIds.mine,);
    expect(body.questions[0]!.question_text,).toBe("Who opened the door?",);
    expect(body.questions[0]!.speaker_id,).toBe("Ada",);
    expect(body.questions[0]!.scene_index,).toBe(0,);
    expect(body.questions[0]!.status,).toBe("available",);
    // Impacts are returned (choices-system parity) rather than written back.
    expect(body.questions[0]!.relationship_impact,).toEqual({ ada: 10, },);
    // Options are parsed from JSON into typed objects.
    expect(body.questions[0]!.options.map((o,) => o.id),).toEqual(["o1", "o2",],);
    expect(body.questions[0]!.options[0]!.relationship_modifier,).toBe(10,);

    await db.destroy();
  });

  test("non-ok sceneIndex is a 400", async () => {
    const { db, } = await createTestDb();
    await seed(db, ids(),);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions?sceneIndex=-1`,),
    );

    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("non-participant receives 404 (chat not found), not 403", async () => {
    const { db, } = await createTestDb();
    await seed(db, ids(),);

    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("non-participant cannot answer a question (404, not 403)", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "o1", },),
      },),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("participant answers a question; the row records the choice", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "o2", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      question: { status: string; selected_option_id: string; answered_at: string | null };
      option: { id: string };
      nextSceneId: string | null;
      relationshipImpact: Record<string, number>;
      moodImpact: Record<string, number>;
    };

    expect(body.question.status,).toBe("answered",);
    expect(body.question.selected_option_id,).toBe("o2",);
    expect(body.question.answered_at,).not.toBeNull();
    expect(body.option.id,).toBe("o2",);
    expect(body.relationshipImpact,).toEqual({ ada: 10, },);
    expect(body.moodImpact,).toEqual({ wary: 5, },);

    // Answered questions drop out of the scene listing.
    const listRes = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
    );

    const list = await listRes.json() as { questions: unknown[] };

    expect(list.questions,).toHaveLength(0,);

    await db.destroy();
  });

  test("a cross-chat question id is rejected (404) and stays available", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    // The participant owns OTHER_CHAT_ID but not CHAT_ID's question.
    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${OTHER_CHAT_ID}/vn-questions/${questionIds.mine}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "o1", },),
      },),
    );

    expect(res.status,).toBe(404,);

    const row = await db
      .selectFrom("vn_questions",)
      .select(["status", "selected_option_id",],)
      .where("id", "=", questionIds.mine,)
      .executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);
    expect(row.selected_option_id,).toBeNull();

    await db.destroy();
  });

  test("an unknown option id is a 400 and records nothing", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "no-such-option", },),
      },),
    );

    expect(res.status,).toBe(400,);

    const row = await db
      .selectFrom("vn_questions",)
      .select("status",)
      .where("id", "=", questionIds.mine,)
      .executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);

    await db.destroy();
  });

  test("answering twice is rejected with 400", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const url = `http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`;
    const post = () =>
      app.handle(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ optionId: "o1", },),
        },),
      );

    expect((await post()).status,).toBe(200,);
    expect((await post()).status,).toBe(400,);

    await db.destroy();
  });

  // The sequential test above passes even with an unguarded UPDATE, because
  // awaiting serially means the second call observes the first one's write.
  // Firing both at once is what exposes a missing status predicate: both used
  // to return 200 while the row silently kept only the second option.
  test("two concurrent answers yield exactly one success", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const url = `http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`;
    const post = (optionId: string,) =>
      app.handle(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ optionId, },),
        },),
      );

    const [resA, resB,] = await Promise.all([post("o1",), post("o2",),],);

    const statuses = [resA.status, resB.status,].sort();
    expect(statuses,).toEqual([200, 400,],);

    const winner = resA.status === 200 ? await resA.json() : await resB.json();
    const row = await db
      .selectFrom("vn_questions",)
      .select(["status", "selected_option_id",],)
      .where("id", "=", questionIds.mine,)
      .executeTakeFirstOrThrow();

    expect(row.status,).toBe("answered",);
    // The stored option must be the one the 200 actually reported, not the
    // loser's — that divergence is the bug this test exists to catch.
    expect(row.selected_option_id,).toBe((winner as { option: { id: string } }).option.id,);

    await db.destroy();
  });

  // The frontend branches on `locationId` to PUT the player into the new place.
  // If the route stops returning it that branch dies silently, so pin the
  // contract in both directions here.
  test("the answer returns the option's consequence location", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    await db
      .updateTable("vn_questions",)
      .set({
        options: JSON.stringify([
          { id: "o1", text: "Go with her", consequence: { location: "loc-42", }, },
        ],),
      },)
      .where("id", "=", questionIds.mine,)
      .execute();

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(
        `http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ optionId: "o1", },),
        },
      ),
    );

    expect(res.status,).toBe(200,);
    expect((await res.json() as { locationId?: string }).locationId,).toBe("loc-42",);

    await db.destroy();
  });

  test("the answer omits locationId when no consequence carries one", async () => {
    const { db, } = await createTestDb();
    const questionIds = ids();
    await seed(db, questionIds,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(
        `http://localhost/api/v1/chats/${CHAT_ID}/vn-questions/${questionIds.mine}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ optionId: "o1", },),
        },
      ),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { locationId?: string };
    expect(body.locationId ?? null,).toBeNull();

    await db.destroy();
  });
});
