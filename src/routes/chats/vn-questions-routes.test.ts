// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for routes/chats/vn-questions.ts#vnQuestionRoutes — the route factory
 * itself, mounted directly rather than through chatsRoutes.
 *
 * The behavioural contract here is the prefix: it defaults to `/api` and must
 * move ALL three endpoints together, since the same rows back both the
 * versioned and unversioned clients.
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
import { vnQuestionRoutes, } from "./vn-questions";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const CHAT_ID = randomUUID();

const OPTIONS_JSON = JSON.stringify([
  { id: "o1", text: "I opened it", emotion_modifier: 5, relationship_modifier: 10, },
  { id: "o2", text: "Someone else did", emotion_modifier: -5, relationship_modifier: -10, },
],);

/** The two seeded question ids, so answer and dismiss use distinct rows. */
interface SeededQuestions {
  answered: string;
  dismissed: string;
}

/** Seed a chat with two available questions at scene 0, returning both ids. */
async function seedWithQuestions(db: Kysely<DB>,): Promise<SeededQuestions> {
  await insertUsers(db, `r-owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `r-part-${PARTICIPANT_ID}`, "Part", { id: PARTICIPANT_ID, } as never,);
  await insertActors(db, "Part", {
    id: PARTICIPANT_ID,
    user_id: PARTICIPANT_ID,
    owner_id: OWNER_ID,
  } as never,);

  await insertChats(db, "Route chat", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, {} as never,);
  const options = { question_type: "lore", speaker_id: "Ada", options: OPTIONS_JSON, status: "available", };
  const answered = await insertVnQuestions(db, CHAT_ID, 0, "Who opened the door?", new Date().toISOString(), options,);
  const dismissed = await insertVnQuestions(db, CHAT_ID, 0, "Do you trust her?", new Date().toISOString(), options,);
  return { answered, dismissed, };
}

/** Mount the factory directly under `prefix` (or the default when omitted). */
function mount(db: Kysely<DB>, userId: string, prefix?: string,) {
  const config = createConfigSchema().defaults as Config;
  const base = new Elysia().derive(() => ({ userId, userRole: "member", }));
  return prefix === undefined
    ? base.use(vnQuestionRoutes({ database: db, config, },),)
    : base.use(vnQuestionRoutes({ database: db, config, }, prefix,),);
}

describe("vnQuestionRoutes", () => {
  test("defaults to the /api prefix and serves all three endpoints", async () => {
    const { db, } = await createTestDb();
    const questions = await seedWithQuestions(db,);
    const app = mount(db, PARTICIPANT_ID,);
    const base = `http://localhost/api/chats/${CHAT_ID}/vn-questions`;
    const listUrl = `${base}?sceneIndex=0`;

    const list = await app.handle(new Request(listUrl,),);
    expect(list.status,).toBe(200,);
    const listed = await list.json() as { questions: { id: string }[] };
    expect(listed.questions.length,).toBe(2,);

    const answered = await app.handle(
      new Request(`${base}/${questions.answered}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ optionId: "o1", },),
      },),
    );

    expect(answered.status,).toBe(200,);

    // The answered row drops out of the available list; the sibling stays,
    // so the dismiss below still has an available row to act on.
    const afterAnswer = await app.handle(new Request(listUrl,),);
    const body = await afterAnswer.json() as { questions: { id: string }[] };
    expect(body.questions.map((q,) => q.id),).toEqual([questions.dismissed,],);

    const dismissed = await app.handle(
      new Request(`${base}/${questions.dismissed}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: "{}",
      },),
    );

    expect(dismissed.status,).toBe(200,);

    const final = await app.handle(new Request(listUrl,),);
    const finalBody = await final.json() as { questions: unknown[] };
    expect(finalBody.questions.length,).toBe(0,);

    await db.destroy();
  });

  test("honours a custom prefix and does not also answer at /api", async () => {
    const { db, } = await createTestDb();
    await seedWithQuestions(db,);
    const app = mount(db, PARTICIPANT_ID, "/api/v1",);

    const atV1 = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
    );

    expect(atV1.status,).toBe(200,);

    // The default path must 404 under a custom prefix — otherwise versioned
    // and unversioned clients could diverge against the same rows.
    const atDefault = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
    );

    expect(atDefault.status,).toBe(404,);

    await db.destroy();
  });
});
