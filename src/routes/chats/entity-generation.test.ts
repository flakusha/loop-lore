// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the in-story entity-generation handoff endpoints.
 *
 * GET /api/v1/chats/:id/entity-suggestions — stateless narration scan;
 * POST /api/v1/chats/:id/generate-entity — validation, access gate, and the
 * creation-chat handoff behind the existing confirm persistence gate.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../db/enums-core/messages";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./index";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();

/** Build chatsRoutes with an entity-character workflow template injected. */
function makeApp(db: Kysely<DB>, userId: string | undefined,) {
  const config = createConfigSchema().defaults as Config;
  const templates = config.templates as unknown as {
    workflows?: { workflows?: Record<string, unknown> };
  };
  templates.workflows ??= { workflows: {}, };
  templates.workflows.workflows ??= {};
  templates.workflows.workflows["entity-character"] = { id: "entity-character", steps: [], };
  return new Elysia()
    .derive(() => ({ userId, userRole: "member", }))
    .use(chatsRoutes({ database: db, config, }, "/api/v1",),);
}

/**
 * Seed owner + participant + outsider and an owner-owned group chat with the
 * participant added, plus one narration message introducing Mira.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
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

  await insertChats(db, "Story Chat", OWNER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "story",
  } as never,);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, {} as never,);

  await insertMessages(
    db,
    CHAT_ID,
    PARTICIPANT_ID,
    MessageRole.Assistant,
    "Mira, a weathered scout, enters the campfire light.",
    { visibility: "visible", } as never,
  );
}

describe("entity-suggestions route", () => {
  test("participant receives detected introductions", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/entity-suggestions`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: { kind: string; name: string; seed: string }[] };
    expect(body.items.find((item,) => item.name === "Mira",),).toBeDefined();
    expect(body.items[0]!.seed,).toContain("Mira",);

    await db.destroy();
  });

  test("outsider receives 404 (membership not leaked)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/entity-suggestions`,),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("unauthenticated request receives 401", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, undefined,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/entity-suggestions`,),
    );

    expect(res.status,).toBe(401,);

    await db.destroy();
  });
});

describe("generate-entity route", () => {
  test("participant starts a creation chat (201 + chatId)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/generate-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ kind: "character", seed: "Mira, a weathered scout.", },),
      },),
    );

    expect(res.status,).toBe(201,);
    const body = await res.json() as { chatId: string; kind: string };
    expect(typeof body.chatId,).toBe("string",);
    expect(body.kind,).toBe("character",);

    await db.destroy();
  });

  test("unknown kind receives 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/generate-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ kind: "starship", seed: "An old vessel.", },),
      },),
    );

    expect(res.status,).toBe(400,);

    await db.destroy();
  });

  test("empty seed receives 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/generate-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ kind: "character", seed: "   ", },),
      },),
    );

    expect(res.status,).toBe(400,);

    await db.destroy();
  });

  test("outsider receives 404 (membership not leaked)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/generate-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ kind: "character", seed: "Mira, a weathered scout.", },),
      },),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });
});