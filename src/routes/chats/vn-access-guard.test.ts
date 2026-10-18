// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Access-guard branches for the id-scoped VN routes that the behavioural suites
 * do not reach.
 *
 * `vn-choices.test.ts` and `vn-questions.test.ts` already pin the ordinary
 * NON-PARTICIPANT case (404, no existence oracle) and the participant happy
 * path. What those files leave untested are the two branches that depend on the
 * permission matrix rather than on participation:
 *
 *   1. `requireUserId(ctx)` — an anonymous caller (`userId: null`, exactly what
 *      src/elysia-app.ts yields when authentication fails) must be refused with
 *      401 BEFORE `checkChatAccess` runs, rather than being resolved as "no
 *      participation" and answered 404.
 *   2. `can(userRole, "admin.chat")` inside `checkChatAccess` — the ownership
 *      bypass. It must be reachable ONLY by the wildcard roles; granting it to
 *      `moderator` would hand a moderator every chat on the instance.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { vnChoiceRoutes, } from "./vn-choices";
import { vnQuestionRoutes, } from "./vn-questions";

const OWNER_ID = "66666666-6666-4666-8666-666666666666";
const OUTSIDER_ID = "77777777-7777-4777-8777-777777777777";
const CHAT_ID = "88888888-8888-4888-8888-888888888888";

/** Mount both VN route factories under the requested identity. */
function mount(db: Kysely<DB>, userId: string | null, userRole: string | null,) {
  const config = createConfigSchema().defaults as Config;
  const opts = { database: db, config, } as never;
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(vnChoiceRoutes(opts,),)
    .use(vnQuestionRoutes(opts,),);
}

/** An owner-created chat; the OUTSIDER is deliberately not a participant. */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, "vn-owner", "VN Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "VN Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, "vn-outsider", "VN Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "VN Outsider", {
    id: OUTSIDER_ID,
    user_id: OUTSIDER_ID,
    owner_id: OUTSIDER_ID,
  } as never,);

  await insertChats(db, "Guarded VN Chat", OWNER_ID, { id: CHAT_ID, type: "group", mode: "vn", } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, {} as never,);
}

const LIST_URLS = [
  "/api/chats/${id}/vn-choices?sceneIndex=0",
  "/api/chats/${id}/vn-questions?sceneIndex=0",
] as const;

describe("VN routes — anonymous caller is refused with 401", () => {
  for (const template of LIST_URLS) {
    test(`GET ${template.replace("${id}", CHAT_ID,)} answers 401, not 404`, async () => {
      const { db, } = await createTestDb();
      await seed(db,);

      // userId null is the documented auth-failure shape from the derive in
      // src/elysia-app.ts. A 404 here would mean the guard fell through to the
      // participation check and treated anonymity as "not a member".
      const res = await mount(db, null, null,).handle(
        new Request(`http://localhost${template.replace("${id}", CHAT_ID,)}`,),
      );

      expect(res.status,).toBe(401,);

      await db.destroy();
    });
  }

  test("POST select/answer 401 for an anonymous caller before reaching the service", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = mount(db, null, null,);
    const choiceId = "99999999-9999-4999-8999-999999999999";

    const selected = await app.handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/vn-choices/${choiceId}/select`,
        { method: "POST", },
      ),
    );

    const answered = await app.handle(
      new Request(
        `http://localhost/api/chats/${CHAT_ID}/vn-questions/${choiceId}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ optionId: "o1", },),
        },
      ),
    );

    expect(selected.status,).toBe(401,);
    expect(answered.status,).toBe(401,);

    await db.destroy();
  });

  test("an anonymous caller cannot dismiss a pending choice or question", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = mount(db, null, null,);
    const cardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    expect(
      (await app.handle(
        new Request(
          `http://localhost/api/chats/${CHAT_ID}/vn-choices/${cardId}/dismiss`,
          { method: "POST", },
        ),
      )).status,
    ).toBe(401,);

    expect(
      (await app.handle(
        new Request(
          `http://localhost/api/chats/${CHAT_ID}/vn-questions/${cardId}/dismiss`,
          { method: "POST", },
        ),
      )).status,
    ).toBe(401,);

    await db.destroy();
  });
});

describe("VN routes — admin.chat ownership bypass is wildcard-only", () => {
  test("an admin who is not a participant still lists the chat's cards", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // The owner seeded the chat; ADMIN is a different user with no participant
    // row, so a 200 here can only come from the can(role, "admin.chat") bypass.
    const res = await mount(db, OUTSIDER_ID, "admin",).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
    );

    expect(res.status,).toBe(200,);

    await db.destroy();
  });

  test("a tester and a solo role get the same bypass (all wildcard roles do)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    for (const role of ["tester", "solo",]) {
      const res = await mount(db, OUTSIDER_ID, role,).handle(
        new Request(`http://localhost/api/chats/${CHAT_ID}/vn-questions?sceneIndex=0`,),
      );

      expect({ role, status: res.status, },).toEqual({ role, status: 200, },);
    }

    await db.destroy();
  });

  test("a moderator does NOT get the bypass — still 404, same as any outsider", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // moderator holds chat.* but NOT admin.chat. If the bypass ever widened to
    // chat.* this would silently become 200 — every chat, for every moderator.
    const res = await mount(db, OUTSIDER_ID, "moderator",).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("a plain user and a creator do NOT get the bypass", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    for (const role of ["user", "creator", "viewer", "guest", "bot", "custom",]) {
      const res = await mount(db, OUTSIDER_ID, role,).handle(
        new Request(`http://localhost/api/chats/${CHAT_ID}/vn-choices?sceneIndex=0`,),
      );

      expect({ role, status: res.status, },).toEqual({ role, status: 404, },);
    }

    await db.destroy();
  });

  test("an unknown chat id stays 404 even for a bypassing admin", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // The bypass must not fabricate access to a chat that does not exist.
    const res = await mount(db, OUTSIDER_ID, "admin",).handle(
      new Request("http://localhost/api/chats/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/vn-choices?sceneIndex=0",),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });
});
