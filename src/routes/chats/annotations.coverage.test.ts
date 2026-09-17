// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for the GM-style annotation routes.
 *
 * Pins the observable contract of `POST|GET /api/chats/:id/annotations`:
 * authentication, chat-access denial (404, never a membership oracle),
 * kind/body/ttl validation, the shadow/memory split, and the merged list
 * returned by the GET path.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { clearMemoryAnnotations, } from "../../chat/proactive/annotations";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./index";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();

/** The annotation view returned by both routes. */
interface AnnotationView {
  id: string;
  chatId: string;
  actorId: string;
  kind: string;
  body: string;
  createdAt: string;
  ttlUntil: string | null;
}

/** Envelope of a `{ data: Annotation }` create response. */
interface CreateBody {
  data: AnnotationView;
}

/** Envelope of a `{ data: Annotation[] }` list response. */
interface ListBody {
  data: AnnotationView[];
}

/** Build chatsRoutes with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "member", }),)
    .use(
      chatsRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),
    ) as unknown as Elysia;
}

/** Seed owner/participant/outsider users+actors and an owner-owned chat. */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(
    db,
    `participant-${PARTICIPANT_ID}`,
    "Participant",
    { id: PARTICIPANT_ID, } as never,
  );
  await insertActors(
    db,
    "Participant",
    { id: PARTICIPANT_ID, user_id: PARTICIPANT_ID, owner_id: PARTICIPANT_ID, } as never,
  );
  await insertUsers(db, `outsider-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(
    db,
    "Outsider",
    { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,
  );

  await insertChats(db, "Annotated", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, {} as never,);
}

/** POST an annotation body and return the response. */
function postAnnotation(
  app: Elysia,
  chatId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/chats/${chatId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** GET the annotation list and return the response. */
function getAnnotations(app: Elysia, chatId: string,): Promise<Response> {
  return app.handle(new Request(`http://localhost/api/chats/${chatId}/annotations`,),);
}

beforeEach(() => {
  clearMemoryAnnotations();
},);

describe("chats/annotations - POST", () => {
  test("unauthenticated create is 401 and writes nothing", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // shadow kind: a leaked write would land in shadow_notes, so the
    // emptiness check below can actually fail.
    const res = await postAnnotation(makeApp(db, null,), CHAT_ID, {
      kind: "shadow",
      body: "no session",
    },);

    expect(res.status,).toBe(401,);
    expect(await db.selectFrom("shadow_notes",).select("id",).execute(),).toHaveLength(0,);
    await db.destroy();
  });

  test("an outsider gets 404 - access denial is not a membership oracle", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OUTSIDER_ID,), CHAT_ID, {
      kind: "shadow",
      body: "sneaky",
    },);

    expect(res.status,).toBe(404,);
    expect(await db.selectFrom("shadow_notes",).select("id",).execute(),).toHaveLength(0,);
    await db.destroy();
  });

  test("an unknown chat id gets 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), "does-not-exist", {
      kind: "note",
      body: "nowhere",
    },);

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("an unsupported kind is rejected before any write", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "prophecy",
      body: "not a kind",
    },);

    // 422 is the request-schema rejection, which is what actually guards this
    // boundary: the handler's own kind guard (annotations.ts:66-70) is not
    // reachable over HTTP. A 400 here would mean the schema stopped enforcing
    // the kind union.
    expect(res.status,).toBe(422,);
    expect(await db.selectFrom("shadow_notes",).select("id",).execute(),).toHaveLength(0,);
    await db.destroy();
  });

  test("an empty body is rejected", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "shadow",
      body: "",
    },);

    // Rejected by `t.String({ minLength: 1 })`, so the handler's own
    // empty-body guard (annotations.ts:71-73) is not reachable over HTTP.
    expect(res.status,).toBe(422,);
    expect(await db.selectFrom("shadow_notes",).select("id",).execute(),).toHaveLength(0,);
    await db.destroy();
  });

  test("a negative ttlMs is rejected with 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "note",
      body: "expires before it starts",
      ttlMs: -1,
    },);

    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("a note lands in the in-memory store, not shadow_notes", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "note",
      body: "Remember the tavern keeper",
    },);
    const body = await res.json() as CreateBody;

    expect(res.status,).toBe(201,);
    expect(body.data.kind,).toBe("note",);
    expect(body.data.chatId,).toBe(CHAT_ID,);
    expect(body.data.actorId,).toBe(OWNER_ID,);
    expect(body.data.body,).toBe("Remember the tavern keeper",);
    expect(body.data.ttlUntil,).toBeNull();
    expect(await db.selectFrom("shadow_notes",).select("id",).execute(),).toHaveLength(0,);
    await db.destroy();
  });

  test("a quest honours a positive ttlMs", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "quest",
      body: "Recover the amulet",
      ttlMs: 60_000,
    },);
    const body = await res.json() as CreateBody;

    expect(res.status,).toBe(201,);
    expect(body.data.kind,).toBe("quest",);
    expect(body.data.ttlUntil,).not.toBeNull();
    expect(Date.parse(body.data.ttlUntil!,),).toBeGreaterThan(Date.now(),);
    await db.destroy();
  });

  test("a shadow annotation is persisted to shadow_notes", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, PARTICIPANT_ID,), CHAT_ID, {
      kind: "shadow",
      body: "The duke is a doppelganger",
    },);
    const body = await res.json() as CreateBody;

    expect(res.status,).toBe(201,);
    expect(body.data.kind,).toBe("shadow",);
    const rows = await db
      .selectFrom("shadow_notes",)
      .select(["id", "chat_id", "content",],)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.id,).toBe(body.data.id,);
    expect(rows[0]!.chat_id,).toBe(CHAT_ID,);
    expect(rows[0]!.content,).toBe("The duke is a doppelganger",);
    await db.destroy();
  });

  test("ttlMs of 0 means non-expiring, not instantly expired", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postAnnotation(makeApp(db, OWNER_ID,), CHAT_ID, {
      kind: "note",
      body: "Lives forever",
      ttlMs: 0,
    },);
    const body = await res.json() as CreateBody;

    expect(res.status,).toBe(201,);
    expect(body.data.ttlUntil,).toBeNull();
    await db.destroy();
  });
});

describe("chats/annotations - GET", () => {
  test("unauthenticated list is 401", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getAnnotations(makeApp(db, null,), CHAT_ID,);

    expect(res.status,).toBe(401,);
    await db.destroy();
  });

  test("an outsider gets 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getAnnotations(makeApp(db, OUTSIDER_ID,), CHAT_ID,);

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("an unknown chat id gets 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getAnnotations(makeApp(db, OWNER_ID,), "does-not-exist",);

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("merges persisted shadow rows with in-memory note/quest annotations", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, PARTICIPANT_ID,);

    const shadowRes = await postAnnotation(app, CHAT_ID, {
      kind: "shadow",
      body: "Hidden fact",
    },);
    const shadowId = ((await shadowRes.json()) as CreateBody).data.id;
    await postAnnotation(app, CHAT_ID, { kind: "note", body: "Player note", },);
    await postAnnotation(app, CHAT_ID, { kind: "quest", body: "Find the well", },);

    const res = await getAnnotations(app, CHAT_ID,);
    const body = await res.json() as ListBody;

    expect(res.status,).toBe(200,);
    expect(body.data,).toHaveLength(3,);
    const shadows = body.data.filter((a,) => a.kind === "shadow");
    expect(shadows,).toHaveLength(1,);
    expect(shadows[0]!.id,).toBe(shadowId,);
    // Shadow rows carry no actor identity (the shadow_notes table has none).
    expect(shadows[0]!.actorId,).toBe("",);
    expect(shadows[0]!.body,).toBe("Hidden fact",);
    expect(shadows[0]!.ttlUntil,).toBeNull();
    expect(body.data.filter((a,) => a.kind === "note"),).toHaveLength(1,);
    expect(body.data.filter((a,) => a.kind === "quest"),).toHaveLength(1,);
    await db.destroy();
  });

  test("a chat with no annotations lists an empty array", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getAnnotations(makeApp(db, OWNER_ID,), CHAT_ID,);
    const body = await res.json() as ListBody;

    expect(res.status,).toBe(200,);
    expect(body.data,).toEqual([],);
    await db.destroy();
  });

  test("annotations are scoped to their own chat", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const otherChatId = randomUUID();
    await insertChats(db, "Other", OWNER_ID, { id: otherChatId, } as never,);

    const app = makeApp(db, OWNER_ID,);
    await postAnnotation(app, CHAT_ID, { kind: "shadow", body: "Chat A only", },);
    await postAnnotation(app, otherChatId, { kind: "note", body: "Chat B only", },);

    const res = await getAnnotations(app, CHAT_ID,);
    const body = await res.json() as ListBody;

    expect(res.status,).toBe(200,);
    expect(body.data.map((a,) => a.body),).toEqual(["Chat A only",],);
    await db.destroy();
  });
});
