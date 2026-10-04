// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Carriage channel tests (TASK-chat-feature-notes-shadow-carriage AC3).
 *
 * Covers the service contract (roundtrip, scope validation, chat scoping,
 * limit clamp, survival of source-chat deletion) plus the three emitter
 * wirings: carryLocation → "section", splitParty → "party",
 * migrateChat → "session".
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertChatSetupTemplates,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  isCarriageScope,
  listCarriage,
  recordCarriage,
} from "./carriage";
import { carryLocation, } from "./carry-location";
import { splitParty, } from "./split";
import { migrateChat, } from "./transitions";

let db: Kysely<DB>;
const OWNER_ID = crypto.randomUUID();

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", {
    id: OWNER_ID,
    user_id: OWNER_ID,
    owner_id: OWNER_ID,
  } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("carriage service", () => {
  test("roundtrip: record persists and lists newest-first", async () => {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Carriage Chat", OWNER_ID, { id: chatId, } as never,);

    const first = await recordCarriage(db, {
      chatId,
      scope: "session",
      payload: { step: 1, },
    },);

    await new Promise((resolve,) => setTimeout(resolve, 5,));
    const second = await recordCarriage(db, {
      chatId,
      sourceChatId: chatId,
      scope: "party",
      payload: { step: 2, },
    },);

    const rows = await listCarriage(db, chatId,);
    expect(rows,).toHaveLength(2,);
    expect(rows[0]?.id,).toBe(second.id,);
    expect(rows[1]?.id,).toBe(first.id,);
    expect(rows[0]?.scope,).toBe("party",);
    expect(rows[0]?.sourceChatId,).toBe(chatId,);
    expect(JSON.parse(rows[1]?.payload ?? "{}",),).toEqual({ step: 1, },);
  });

  test("unknown scope is rejected", async () => {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Bad Scope", OWNER_ID, { id: chatId, } as never,);
    expect(
      recordCarriage(db, {
        chatId,
        scope: "galaxy" as never,
        payload: {},
      },),
    ).rejects.toThrow("Invalid carriage scope",);

    expect(isCarriageScope("section",),).toBe(true,);
    expect(isCarriageScope("nope",),).toBe(false,);
  });

  test("list is scoped to one chat", async () => {
    const chatA = crypto.randomUUID();
    const chatB = crypto.randomUUID();
    await insertChats(db, "A", OWNER_ID, { id: chatA, } as never,);
    await insertChats(db, "B", OWNER_ID, { id: chatB, } as never,);
    await recordCarriage(db, { chatId: chatB, scope: "section", payload: {}, },);

    expect(await listCarriage(db, chatA,),).toHaveLength(0,);
    expect(await listCarriage(db, chatB,),).toHaveLength(1,);
  });

  test("limit option clamps the row count", async () => {
    const chatId = crypto.randomUUID();
    await insertChats(db, "Limited", OWNER_ID, { id: chatId, } as never,);
    for (let i = 0; i < 3; i++) {
      await recordCarriage(db, { chatId, scope: "section", payload: { i, }, },);
      await new Promise((resolve,) => setTimeout(resolve, 5,));
    }

    const capped = await listCarriage(db, chatId, { limit: 1, },);
    expect(capped,).toHaveLength(1,);
    const clamped = await listCarriage(db, chatId, { limit: 9_999, },);
    expect(clamped,).toHaveLength(3,);
  });

  test("record survives deletion of its source chat", async () => {
    const sourceChatId = crypto.randomUUID();
    const destChatId = crypto.randomUUID();
    await insertChats(db, "Source", OWNER_ID, { id: sourceChatId, } as never,);
    await insertChats(db, "Dest", OWNER_ID, { id: destChatId, } as never,);
    const record = await recordCarriage(db, {
      chatId: destChatId,
      sourceChatId,
      scope: "session",
      payload: { carry: { history: "full", }, },
    },);

    await db.deleteFrom("chats",).where("id", "=", sourceChatId,).execute();

    const rows = await listCarriage(db, destChatId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.id,).toBe(record.id,);
    expect(rows[0]?.sourceChatId,).toBe(sourceChatId,);
  });
});

describe("emitter wiring", () => {
  test("carryLocation emits a section-scope record", async () => {
    const sourceChatId = crypto.randomUUID();
    const newChatId = crypto.randomUUID();
    await insertChats(db, "Loc Source", OWNER_ID, { id: sourceChatId, } as never,);
    await insertChats(db, "Loc Dest", OWNER_ID, { id: newChatId, } as never,);
    await db
      .insertInto("chat_sections",)
      .values({ id: crypto.randomUUID(), chat_id: sourceChatId, label: "Journey 1", },)
      .execute();

    await db
      .insertInto("chat_sections",)
      .values({ id: crypto.randomUUID(), chat_id: sourceChatId, label: "Journey 2", },)
      .execute();

    await carryLocation(db, sourceChatId, newChatId,);

    const rows = await listCarriage(db, newChatId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.scope,).toBe("section",);
    expect(rows[0]?.sourceChatId,).toBe(sourceChatId,);
    expect(JSON.parse(rows[0]?.payload ?? "{}",),).toEqual({ sectionsCarried: 2, },);
  });

  test("splitParty emits a party-scope record on the initiating chat", async () => {
    const heroId = crypto.randomUUID();
    const rogueId = crypto.randomUUID();
    const srcChatId = crypto.randomUUID();
    await insertActors(db, "Hero", { id: heroId, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
    await insertActors(db, "Rogue", { id: rogueId, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
    await insertActors(db, "Narrator", {
      id: crypto.randomUUID(),
      user_id: OWNER_ID,
      owner_id: OWNER_ID,
      actor_type: "narrator",
      agent_type: "narrator",
    } as never,);

    await insertChats(db, "Party Dungeon", OWNER_ID, {
      id: srcChatId,
      type: "group",
      mode: "group",
    } as never,);

    await insertChatParticipants(db, srcChatId, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
    await insertChatParticipants(db, srcChatId, heroId, { role_in_chat: ChatParticipantRole.Member, },);
    await insertChatParticipants(db, srcChatId, rogueId, { role_in_chat: ChatParticipantRole.Member, },);

    const worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({ id: worldId, name: "W", owner_id: OWNER_ID, },).execute();
    await db.insertInto("locations",).values({ id: "forest", world_id: worldId, name: "Forest", },).execute();
    await db.insertInto("locations",).values({ id: "cave", world_id: worldId, name: "Cave", },).execute();

    const result = await splitParty(db, {
      chatId: srcChatId,
      actorId: OWNER_ID,
      branches: [
        { locationId: "forest", actorIds: [heroId,], name: "Scouts", },
        { locationId: "cave", actorIds: [rogueId,], name: "Main", },
      ],
    },);

    expect("ok" in result && result.ok,).toBe(true,);

    const rows = await listCarriage(db, srcChatId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.scope,).toBe("party",);
    const payload = JSON.parse(rows[0]?.payload ?? "{}",) as {
      branches: Array<{ locationId: string }>;
    };

    expect(payload.branches,).toHaveLength(2,);
    expect(payload.branches.map((b,) => b.locationId).sort(),).toEqual(["cave", "forest",],);
  });

  test("migrateChat emits a session-scope record on the destination chat", async () => {
    const sourceChatId = crypto.randomUUID();
    const templateId = await insertChatSetupTemplates(
      db,
      "tpl-carriage",
      "Carriage Template",
      { mode: "direct", } as never,
    );

    await insertChats(db, "To Migrate", OWNER_ID, { id: sourceChatId, } as never,);

    const result = await migrateChat(db, sourceChatId, {
      templateId,
      createdBy: OWNER_ID,
      name: "Migrated",
      carry: {},
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) {
      return;
    }

    const rows = await listCarriage(db, result.newChatId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.scope,).toBe("session",);
    expect(rows[0]?.sourceChatId,).toBe(sourceChatId,);
    expect(JSON.parse(rows[0]?.payload ?? "{}",),).toEqual({ carry: {}, },);
  });
});
