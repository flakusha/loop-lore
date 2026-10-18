/**
 * SPDX-License-Identifier: LGPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Loop Lore Contributors
 */

/**
 * Tests for the ownership predicates behind every `/dynamic/*` fragment.
 *
 * `characters.test.ts` proves the loaders honour these; these tests pin the
 * rules themselves, so the two surfaces cannot drift apart silently.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { type ViewsViewer, visibleCharactersTo, visibleChatsTo, } from "./access";

describe("views/access ownership predicates", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  const OWNER: ViewsViewer = { userId: "u-p-owner", userRole: "user", };
  const STRANGER: ViewsViewer = { userId: "u-p-stranger", userRole: "user", };
  const ADMIN: ViewsViewer = { userId: "u-p-owner", userRole: "admin", };

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    await insertUsers(db, "u-p-owner", "P Owner", { id: "u-p-owner" as never, },);
    await insertUsers(db, "u-p-stranger", "P Stranger", { id: "u-p-stranger" as never, },);
    await insertActors(db, "P Mine", {
      id: "actor-p-mine" as never,
      actor_type: "character" as never,
      owner_id: "u-p-owner" as never,
    },);

    await insertActors(db, "P Theirs", {
      id: "actor-p-theirs" as never,
      actor_type: "character" as never,
      owner_id: "u-p-stranger" as never,
    },);

    // A human's actor row is created with `id = user_id` (see
    // src/routes/actor-access.ts), which is why chat creation can store the
    // creator's *user* id as the owner participant's `actor_id`.
    await insertActors(db, "P Owner", { id: "u-p-owner" as never, user_id: "u-p-owner" as never, },);
    await insertActors(db, "P Stranger", {
      id: "u-p-stranger" as never,
      user_id: "u-p-stranger" as never,
    },);

    await insertChats(db, "P Created", "u-p-owner", { id: "chat-p-created" as never, },);
    await insertChatParticipants(db, "chat-p-created", "u-p-owner",);
    await insertChats(db, "P Joined", "u-p-stranger", { id: "chat-p-joined" as never, },);
    await insertChatParticipants(db, "chat-p-joined", "u-p-owner",);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  // Mirrors the grid query: the caller's own `actor_type` filter composes with
  // the ownership predicate rather than replacing it.
  const visibleActors = (viewer: ViewsViewer,): Promise<string[]> =>
    db.selectFrom("actors",)
      .select("actors.id",)
      .where("actors.actor_type", "!=", ActorType.User,)
      .where(visibleCharactersTo(viewer,),)
      .execute()
      .then((rows,) => rows.map((r,) => r.id).sort());

  const visibleChats = (viewer: ViewsViewer,): Promise<string[]> =>
    db.selectFrom("chats",)
      .select("chats.id",)
      .where(visibleChatsTo(viewer,),)
      .execute()
      .then((rows,) => rows.map((r,) => r.id).sort());

  test("visibleCharactersTo scopes to actors.owner_id and admits admin.character", async () => {
    expect(await visibleActors(OWNER,),).toEqual(["actor-p-mine",],);
    expect(await visibleActors(STRANGER,),).toEqual(["actor-p-theirs",],);
    expect(await visibleActors(ADMIN,),).toEqual(["actor-p-mine", "actor-p-theirs",],);
  });

  test("visibleChatsTo admits creator and participant, and admin.chat", async () => {
    expect(await visibleChats(OWNER,),).toEqual(["chat-p-created", "chat-p-joined",],);
    // The stranger created `chat-p-joined` and is not a member of `chat-p-created`.
    expect(await visibleChats(STRANGER,),).toEqual(["chat-p-joined",],);
    expect(await visibleChats(ADMIN,),).toEqual(["chat-p-created", "chat-p-joined",],);
  });
});
