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
async function seed(db: Kysely<DB>,): Promise<string> {
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

  const choiceId = await insertVnChoices(
    db,
    CHAT_ID,
    0,
    "Approach the glowing door",
    new Date().toISOString(),
    { status: "available" as never, },
  );

  return choiceId;
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

// ── POST /vn-choices/:choiceId/select ──────────────────────────────────────

describe("POST /api/v1/chats/:id/vn-choices/:choiceId/select", () => {
  test("participant selects a choice: row flips to selected and the payload reports it", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`, { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { choice: { id: string; selected: number }; locationId?: string };
    expect(body.choice.id,).toBe(choiceId,);
    // The response mirrors the mutation: a client that got 200 must see selected=1,
    // otherwise it believes it chose while the row still reads available.
    expect(body.choice.selected,).toBe(1,);

    // Observable persisted state, not just the echoed payload.
    const row = await db.selectFrom("vn_choices",).select(["status", "selected_at",],)
      .where("id", "=", choiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("selected",);
    expect(row.selected_at,).not.toBeNull();

    await db.destroy();
  });

  test("a second select of the same choice is rejected (single-shot), not silently re-applied", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const url = `http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`;
    expect((await app.handle(new Request(url, { method: "POST", },),)).status,).toBe(200,);

    // The status predicate makes selection single-shot; without it this would
    // return 200 again and the client would think its re-pick won.
    const second = await app.handle(new Request(url, { method: "POST", },),);
    expect(second.status,).toBe(400,);
    const body = await second.json() as { error: string };
    expect(body.error,).toBe("Choice already selected",);

    await db.destroy();
  });

  test("select surfaces a 'location' consequence as locationId", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);
    await db.updateTable("vn_choices",).set({ consequences: JSON.stringify({ location: "loc-42", },), },)
      .where("id", "=", choiceId,).execute();

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`, { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { locationId?: string };
    // The FE drives PUT /chats/:id/location from this field; a missing extraction
    // silently strands the player on the old scene.
    expect(body.locationId,).toBe("loc-42",);

    await db.destroy();
  });

  test("select on an unknown choice id is 404 and leaves no row behind", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${randomUUID()}/select`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("Choice not found",);

    await db.destroy();
  });

  test("select is IDOR-guarded: a choice from another chat reads as not_found", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // A second chat the actor owns, holding its own available choice.
    const otherChatId = randomUUID();
    await insertChats(db, "Other VN Chat", OWNER_ID, { id: otherChatId, type: "group", mode: "vn", } as never,);
    await insertChatParticipants(db, otherChatId, PARTICIPANT_ID, {} as never,);
    const otherChoiceId = await insertVnChoices(
      db,
      otherChatId,
      0,
      "Other chat choice",
      new Date().toISOString(),
      { status: "available" as never, },
    );

    // Participant is a member of BOTH chats, so only the chat_id predicate in
    // selectVnChoice can keep the two choices separated.
    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${otherChoiceId}/select`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);

    // The cross-chat choice must remain untouched, not resolved by a foreign request.
    const row = await db.selectFrom("vn_choices",).select(["status",],)
      .where("id", "=", otherChoiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);

    await db.destroy();
  });

  test("a non-participant cannot select (404 before the service is reached)", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const res = await makeApp(db, OUTSIDER_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
    const row = await db.selectFrom("vn_choices",).select(["status",],)
      .where("id", "=", choiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);

    await db.destroy();
  });
});

// ── POST /vn-choices/:choiceId/dismiss ─────────────────────────────────────

describe("POST /api/v1/chats/:id/vn-choices/:choiceId/dismiss", () => {
  test("participant dismisses a pending choice: status flips to dismissed", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/dismiss`, { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { dismissed: string };
    expect(body.dismissed,).toBe(choiceId,);

    // The escape hatch must write status, not a timestamp column: a `dismissed_at`
    // write would leave status='available' and keep the decision gate blocked.
    const row = await db.selectFrom("vn_choices",).select(["status", "selected_at",],)
      .where("id", "=", choiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("dismissed",);
    expect(row.selected_at,).toBeNull();

    await db.destroy();
  });

  test("dismissing an already-dismissed choice is 404, not a second success", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const url = `http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/dismiss`;
    expect((await app.handle(new Request(url, { method: "POST", },),)).status,).toBe(200,);

    // Zero updated rows must not be reported as a fresh dismissal.
    const second = await app.handle(new Request(url, { method: "POST", },),);
    expect(second.status,).toBe(404,);
    const body = await second.json() as { error: string };
    expect(body.error,).toBe("Choice not found or already resolved",);

    await db.destroy();
  });

  test("dismissing a choice that was already selected is 404 (status predicate is not 'available')", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const selectUrl = `http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`;
    expect((await app.handle(new Request(selectUrl, { method: "POST", },),)).status,).toBe(200,);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/dismiss`, { method: "POST", },),
    );

    // A selected choice is resolved; dismissing must not overwrite that verdict.
    expect(res.status,).toBe(404,);
    const row = await db.selectFrom("vn_choices",).select(["status",],)
      .where("id", "=", choiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("selected",);

    await db.destroy();
  });

  test("dismiss is IDOR-guarded: another chat's choice is not_found and stays available", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const otherChatId = randomUUID();
    await insertChats(db, "Other VN Chat", OWNER_ID, { id: otherChatId, type: "group", mode: "vn", } as never,);
    await insertChatParticipants(db, otherChatId, PARTICIPANT_ID, {} as never,);
    const otherChoiceId = await insertVnChoices(
      db,
      otherChatId,
      0,
      "Other chat choice",
      new Date().toISOString(),
      { status: "available" as never, },
    );

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${otherChoiceId}/dismiss`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
    const row = await db.selectFrom("vn_choices",).select(["status",],)
      .where("id", "=", otherChoiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);

    await db.destroy();
  });

  test("a non-participant cannot dismiss, and the choice stays pending", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const res = await makeApp(db, OUTSIDER_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/dismiss`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
    const row = await db.selectFrom("vn_choices",).select(["status",],)
      .where("id", "=", choiceId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);

    await db.destroy();
  });

  test("dismissing an unknown choice id is 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${randomUUID()}/dismiss`, { method: "POST", },),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });
});

// ── list: sceneIndex validation ────────────────────────────────────────────

describe("GET /api/v1/chats/:id/vn-choices validation", () => {
  test("a non-integer sceneIndex is 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=abc`,),
    );

    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("sceneIndex must be a non-negative integer",);

    await db.destroy();
  });

  test("a negative sceneIndex is 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=-1`,),
    );

    // -1 is a valid integer but not a valid scene; the guard is `>= 0`, not
    // merely "is an integer".
    expect(res.status,).toBe(400,);

    await db.destroy();
  });

  test("a selected choice disappears from the list (status='available' filter)", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const listUrl = `http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=0`;

    const before = await (await app.handle(new Request(listUrl,),)).json() as { choices: unknown[] };
    expect(before.choices,).toHaveLength(1,);

    await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/select`, { method: "POST", },),
    );

    // Once resolved, the pending query must stop returning it or the decision
    // gate stays wedged on a choice the player already answered.
    const after = await (await app.handle(new Request(listUrl,),)).json() as { choices: unknown[] };
    expect(after.choices,).toHaveLength(0,);

    await db.destroy();
  });

  test("a dismissed choice disappears from the pending list", async () => {
    const { db, } = await createTestDb();
    const choiceId = await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const listUrl = `http://localhost/api/v1/chats/${CHAT_ID}/vn-choices?sceneIndex=0`;

    await app.handle(
      new Request(`http://localhost/api/v1/chats/${CHAT_ID}/vn-choices/${choiceId}/dismiss`, { method: "POST", },),
    );

    const after = await (await app.handle(new Request(listUrl,),)).json() as { choices: unknown[] };
    expect(after.choices,).toHaveLength(0,);

    await db.destroy();
  });
});
