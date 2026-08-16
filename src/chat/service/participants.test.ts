/**
 * Tests for `updateImpersonation` (chat participant operations).
 *
 * Covers the 1-per-world impersonation constraint: an actor may only be
 * impersonated by one user per world, with private/disconnected chats
 * exempt (no world → no check).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { updateImpersonation, } from "./participants";

describe("updateImpersonation", () => {
  let db: Kysely<DB>;
  const userA: string = crypto.randomUUID();
  const userB: string = crypto.randomUUID();
  const heroActorId: string = crypto.randomUUID();
  const worldId = "test-world-impersonation";
  const otherWorldId = "test-world-impersonation-other";
  const chatWorld = crypto.randomUUID();
  const chatWorld2 = crypto.randomUUID();
  const chatOtherWorld = crypto.randomUUID();
  const chatNoWorld = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-a-${userA}`, "User A", { id: userA, } as never,);
    await insertUsers(db, `user-b-${userB}`, "User B", { id: userB, } as never,);

    // Participant rows store the user id as actor_id (FK → actors.id),
    // so each user needs an actors row keyed by their own id.
    await insertActors(db, "Player A", { id: userA, user_id: userA, owner_id: userA, } as never,);
    await insertActors(db, "Player B", { id: userB, user_id: userB, owner_id: userB, } as never,);
    await insertActors(db, "Hero", { id: heroActorId, user_id: userB, owner_id: userB, } as never,);

    await db.insertInto("worlds",).values({ id: worldId, name: "World", owner_id: userA, },).execute();
    await db.insertInto("worlds",).values({ id: otherWorldId, name: "Other World", owner_id: userB, },).execute();

    await insertChats(db, "Chat W1", userA, {
      id: chatWorld,
      world_id: worldId,
    } as never,);
    await insertChats(db, "Chat W1b", userA, {
      id: chatWorld2,
      world_id: worldId,
    } as never,);
    await insertChats(db, "Chat W2", userB, {
      id: chatOtherWorld,
      world_id: otherWorldId,
    } as never,);
    await insertChats(db, "Chat No World", userA, { id: chatNoWorld, } as never,);

    await insertChatParticipants(db, chatWorld, userA, {},);
    await insertChatParticipants(db, chatWorld2, userA, {},);
    await insertChatParticipants(db, chatWorld2, userB, {},);
    await insertChatParticipants(db, chatOtherWorld, userB, {},);
    await insertChatParticipants(db, chatNoWorld, userA, {},);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns undefined when clearing impersonation", async () => {
    const result = await updateImpersonation(db, chatWorld, userA, null,);
    expect(result,).toBeUndefined();
  });

  test("sets impersonation on a chat without a world (no conflict check)", async () => {
    const result = await updateImpersonation(db, chatNoWorld, userA, heroActorId,);
    expect(result,).toBeUndefined();

    const row = await db
      .selectFrom("chat_participants",)
      .select("impersonate_actor_id",)
      .where("chat_id", "=", chatNoWorld,)
      .where("actor_id", "=", userA,)
      .executeTakeFirst();
    expect(row?.impersonate_actor_id,).toBe(heroActorId,);
  });

  test("sets impersonation when no other user impersonates the actor in the world", async () => {
    const result = await updateImpersonation(db, chatWorld, userA, heroActorId,);
    expect(result,).toBeUndefined();

    const row = await db
      .selectFrom("chat_participants",)
      .select("impersonate_actor_id",)
      .where("chat_id", "=", chatWorld,)
      .where("actor_id", "=", userA,)
      .executeTakeFirst();
    expect(row?.impersonate_actor_id,).toBe(heroActorId,);
  });

  test("returns bad_request when another user already impersonates the actor in the same world", async () => {
    // Reset shared state first: clear userA's hold, then give the actor to userB.
    await updateImpersonation(db, chatWorld, userA, null,);
    await updateImpersonation(db, chatWorld2, userB, heroActorId,);

    const result = await updateImpersonation(db, chatWorld, userA, heroActorId,);
    expect(result,).toEqual({
      code: "bad_request",
      message: "This character is already being impersonated by another user in this world",
    },);

    // userA's row must NOT have been updated.
    const row = await db
      .selectFrom("chat_participants",)
      .select("impersonate_actor_id",)
      .where("chat_id", "=", chatWorld,)
      .where("actor_id", "=", userA,)
      .executeTakeFirst();
    expect(row?.impersonate_actor_id,).toBeNull();
  });

  test("allows the same user to impersonate the same actor in multiple chats of one world", async () => {
    // userA already impersonates Hero in chatWorld (from the earlier test);
    // clearing userB's hold on chatWorld2 and impersonating Hero there again
    // as the SAME user (userA) must not conflict.
    await updateImpersonation(db, chatWorld2, userB, null,);
    await updateImpersonation(db, chatWorld, userA, heroActorId,);

    const result = await updateImpersonation(db, chatWorld2, userA, heroActorId,);
    expect(result,).toBeUndefined();

    const row = await db
      .selectFrom("chat_participants",)
      .select("impersonate_actor_id",)
      .where("chat_id", "=", chatWorld2,)
      .where("actor_id", "=", userA,)
      .executeTakeFirst();
    expect(row?.impersonate_actor_id,).toBe(heroActorId,);
  });

  test("ignores impersonation conflicts in other worlds", async () => {
    await updateImpersonation(db, chatOtherWorld, userB, heroActorId,);
    await updateImpersonation(db, chatWorld2, userA, null,);

    // userA impersonates Hero in chatWorld (world W1); userB impersonates the
    // same Hero in chatOtherWorld (world W2) — must not conflict.
    const result = await updateImpersonation(db, chatWorld, userA, heroActorId,);
    expect(result,).toBeUndefined();
  });

  test("does not throw when the chat does not exist", async () => {
    const result = await updateImpersonation(db, "missing-chat", userA, heroActorId,);
    expect(result,).toBeUndefined();
  });
});
