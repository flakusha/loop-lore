// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Age-gate send-time enforcement (theme-5 AC6): a minor who never passed the
 * shipped age-gate flow gets 403 on every send — chat-create gates new chats,
 * this closes the existing-chat path. Follows mute-gate.test.ts: gate unit
 * tests against `guards.enforceAgeGate` plus route wiring through
 * POST /chats/:id/messages.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { initAgeGate, } from "../../age-gate/controller";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { AgeGateMode, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createRoutes, } from "./create";
import { enforceAgeGate, } from "./guards";

const BASE = "http://localhost";

let db: Kysely<DB>;
let adultId: string;
let minorId: string;
let chatId: string;

/** Seed one chat shared by both principals (adult sends, minor is blocked). */
async function seedChat(): Promise<void> {
  for (const [id, name,] of [[adultId, "Adult",], [minorId, "Minor",],] as const) {
    await db
      .insertInto("actors",)
      .values({
        id,
        actor_type: "user",
        display_name: name,
        user_id: id,
        owner_id: id,
        agent_type: "none",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: id, role_in_chat: "member", },)
      .execute();
  }
}

function makeApp(userId: string,): Elysia {
  const app = new Elysia({ name: "test-age-gate-send", },);
  app.derive(() => ({ userId, userRole: "user", }));
  return app.use(
    createRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),
  ) as unknown as Elysia;
}

describe("enforceAgeGate", () => {
  beforeAll(async () => {
    createLogger({ level: "error", },);
    db = (await createTestDb()).db;
    adultId = await insertUsers(db, "adult", "Adult", {
      birth_date: "2000-01-01",
      age_gate_accepted_at: "2024-06-01T12:00:00.000Z",
    },);

    minorId = await insertUsers(db, "minor", "Minor",);
    chatId = uid();
    await insertChats(db, "Age Gate Chat", adultId, { id: chatId, } as never,);
    await seedChat();
    initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },);
  },);

  test("adult with birth_date + acceptance passes (null)", async () => {
    const res = await enforceAgeGate(db, adultId,);
    expect(res,).toBeNull();
  });

  test("minor without birth_date is rejected with 403", async () => {
    const res = await enforceAgeGate(db, minorId,);
    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(403,);
    expect(await res!.text(),).toContain("Age gate",);
  });

  test("disabled gate is a no-op (null) for the minor", async () => {
    initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
    const res = await enforceAgeGate(db, minorId,);
    expect(res,).toBeNull();
    initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },);
  });

  test("minor send via POST is rejected with 403 and no message row lands", async () => {
    const app = makeApp(minorId,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "hello there", },),
      },),
    );

    expect(res.status,).toBe(403,);
    const rows = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .where("role", "=", "user",)
      .execute();

    expect(rows,).toHaveLength(0,);
  });

  test("adult send via POST passes the gate (201 + row)", async () => {
    const app = makeApp(adultId,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "hello there", },),
      },),
    );

    expect(res.status,).toBe(201,);
    const userRows = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .where("role", "=", "user",)
      .execute();

    expect(userRows,).toHaveLength(1,);
  });
});

afterAll(async () => {
  initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
  await db.destroy();
},);
