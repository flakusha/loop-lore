// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for migration participant carry (source chat -> migrated chat). */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { carryParticipants, } from "./carry-participants";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "user-1", "User One", { id: "user-1", },);
  for (const actor of ["actor-owner", "actor-member", "actor-existing",]) {
    await insertActors(db, actor, { id: actor, user_id: "user-1", } as never,);
  }
  await insertChats(db, "src", "user-1", { id: "chat-src", },);
  await insertChats(db, "dst", "user-1", { id: "chat-dst", },);
},);

async function participantFields(chatId: string,) {
  const rows = await db
    .selectFrom("chat_participants",)
    .select(["actor_id", "role_in_chat", "persona_id", "impersonate_actor_id",],)
    .where("chat_id", "=", chatId,)
    .orderBy("actor_id",)
    .execute();
  return rows;
}

describe("carryParticipants", () => {
  test("copies every participant with roles and impersonation refs", async () => {
    await insertChatParticipants(db, "chat-src", "actor-owner", {
      role_in_chat: ChatParticipantRole.Owner,
    },);
    await insertChatParticipants(db, "chat-src", "actor-member", {
      role_in_chat: ChatParticipantRole.Member,
      impersonate_actor_id: "actor-owner",
    },);
    await carryParticipants(db, "chat-src", "chat-dst",);
    expect(await participantFields("chat-dst",),).toEqual(
      await participantFields("chat-src",),
    );
  });

  test("empty source leaves the destination untouched", async () => {
    await insertChatParticipants(db, "chat-dst", "actor-existing", {
      role_in_chat: ChatParticipantRole.Member,
    },);
    await carryParticipants(db, "chat-src", "chat-dst",);
    expect(await participantFields("chat-dst",),).toHaveLength(1,);
  });
});
