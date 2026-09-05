// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-mount tests for the guarded VN choices endpoint under `/api/v1`.
 *
 * Regression for BUG-dual-vn-choices-route-registration-shadows-guarded-route
 * and BUG-vn-choice-fe-be-contract-mismatch-renders-blank-labels:
 *
 * 1. The guarded `chats/vn-choices.ts` handler — mounted inside `chatsRoutes`
 *    with the `/api/v1` prefix (the FE's contract) — is the single live
 *    handler. The legacy owner-only `src/routes/vn-choices.ts` registration is
 *    gone, so no shadowing duplicate exists.
 * 2. A chat participant may list choices; a non-participant receives 404 via
 *    `checkChatAccess` (the chat is treated as not found — participantship is
 *    not leaked). The guarded route is never owner-only.
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
  insertVnChoices,
} from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./index";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();

/** Build chatsRoutes with the v1 prefix (FE contract) under a test auth derive. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole: "member", }))
    .use(chatsRoutes({ database: db, config, }, "/api/v1",),);
}

/**
 * Seed owner + participant + outsider users/actors and an owner-owned chat with
 * the participant added. One VN choice at scene 0.
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

  await insertChats(db, "VN Chat", OWNER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "vn",
  } as never,);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, {} as never,);

  await insertVnChoices(
    db,
    CHAT_ID,
    0,
    "Approach the glowing door",
    new Date().toISOString(),
    { status: "available" as never, },
  );
}

describe("guarded VN choices route under /api/v1", () => {
  test("participant lists choices at GET /api/v1/chats/:id/vn-choices", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { choices: { label: string; selected: number; scene_index: number }[] };
    expect(Array.isArray(body.choices,),).toBe(true,);
    expect(body.choices,).toHaveLength(1,);
    expect(body.choices[0]!.label,).toBe("Approach the glowing door",);
    // Guarded service shape: `selected` is a number (0|1), not `is_active`.
    expect(body.choices[0]!.selected,).toBe(0,);
    expect(body.choices[0]!.scene_index,).toBe(0,);

    await db.destroy();
  });

  test("non-participant receives 404 (chat not found), not an owner-only allow", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("GET /api/chats/:id/vn-choices (unversioned) is not a shadowing duplicate", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // The legacy owner-only route registered at /api/chats/:id/vn-choices is
    // deleted. Registering chatsRoutes at /api (no prefix) should NOT produce
    // a second, owner-only handler — the guarded handler under /api is fine.
    const app = new Elysia()
      .derive(() => ({ userId: OUTSIDER_ID, userRole: "member", }))
      .use(chatsRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
    );

    // Guarded handler: outsider → 404, NOT 200-owner-only.
    expect(res.status,).toBe(404,);

    await db.destroy();
  });
});
