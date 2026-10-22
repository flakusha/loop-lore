import type { DB, } from "../db/schema";
import type { Kysely, } from "kysely";
import { Database, } from "bun:sqlite";
import { NotificationService, NotificationType, notifyGmAction, notifyMention, notifyQuestUpdate, } from "./service";
import { beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";

describe("NotificationService", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const userA = uid();
  const userB = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    for (const id of [userA, userB,]) {
      await db
        .insertInto("users",)
        .values({
          id,
          username: `u-${id}`,
          display_name: "U",
          role: "solo",
          status: "active",
          settings: "{}",
        },)
        .execute();
    }
  },);

  test("create + list + unread count", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "Hi", link: "/chat/x", },);
    expect(await svc.getUnreadCount(userA,),).toBe(1,);
    const items = await svc.list(userA,);
    expect(items.length,).toBe(1,);
    expect(items[0]!.type,).toBe("mention",);
  });

  test("mark read + mark all read", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId: userA, type: NotificationType.System, title: "S", },);
    const items = await svc.list(userA, true,);
    const id = items[0]!.id;
    await svc.markRead(id, userA,);
    expect(await svc.getUnreadCount(userA,),).toBe(1,); // one mention still unread
    await svc.markAllRead(userA,);
    expect(await svc.getUnreadCount(userA,),).toBe(0,);
  });

  test("delete", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId: userB, type: NotificationType.ChatInvite, title: "inv", },);
    const items = await svc.list(userB,);
    await svc.delete(items[0]!.id, userB,);
    expect(await svc.getUnreadCount(userB,),).toBe(0,);
  });

  test("preferences default + toggle", async () => {
    const svc = new NotificationService(db,);
    const prefs = await svc.getPrefs(userA,);
    expect(prefs.enabled[NotificationType.Mention],).toBe(true,);
    expect(prefs.enabled[NotificationType.WorldEvent],).toBe(false,);
    const updated = await svc.setPrefs(userA, { enabled: { [NotificationType.WorldEvent]: true, }, },);
    expect(updated.enabled[NotificationType.WorldEvent],).toBe(true,);
  });

  test("disabled type is skipped", async () => {
    const svc = new NotificationService(db,);
    await svc.setPrefs(userA, { enabled: { [NotificationType.Mention]: false, }, },);
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "x", },);
    expect(await svc.getUnreadCount(userA,),).toBe(0,);
    await svc.setPrefs(userA, { enabled: { [NotificationType.Mention]: true, }, },);
  });

  test("world mute skips notification", async () => {
    const svc = new NotificationService(db,);
    await svc.setPrefs(userB, { mutedWorlds: ["w1",], },);
    await svc.create({ userId: userB, type: NotificationType.GmAction, title: "g", worldId: "w1", },);
    expect(await svc.getUnreadCount(userB,),).toBe(0,);
    await svc.setPrefs(userB, { mutedWorlds: [], },);
  });

  test("notifyMention notifies mentioned actor only", async () => {
    const svc = new NotificationService(db,);
    await notifyMention(db, {
      chatId: "c1",
      senderId: userA,
      mentionedActorIds: [userB,],
      messageId: "m1",
    },);

    expect(await svc.getUnreadCount(userB,),).toBe(1,);
    expect(await svc.getUnreadCount(userA,),).toBe(0,);
  });

  test("notifyMention notifies the owning user of a mentioned actor", async () => {
    // notifications.user_id REFERENCES users(id): the recipient is the
    // actor's owning user, never the actor id. A mentioned AI character has
    // no recipient and must not abort the fan-out for the other mentions.
    const svc = new NotificationService(db,);
    const userC = uid();
    await db
      .insertInto("users",)
      .values({
        id: userC,
        username: `u-${userC}`,
        display_name: "U",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const actorC = uid();
    const characterActor = uid();
    await db
      .insertInto("actors",)
      .values([
        {
          id: actorC,
          actor_type: "user",
          display_name: "U",
          user_id: userC,
          owner_id: userC,
          agent_type: "none",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },
        {
          id: characterActor,
          actor_type: "character",
          display_name: "Character",
          user_id: null,
          owner_id: userC,
          agent_type: "none",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },
      ],)
      .execute();

    await notifyMention(db, {
      chatId: "c2",
      senderId: userA,
      mentionedActorIds: [characterActor, actorC,],
      messageId: "m2",
    },);

    expect(await svc.getUnreadCount(userC,),).toBe(1,);
  });

  test("notifyQuestUpdate respects the recipient's world mute", async () => {
    const svc = new NotificationService(db,);
    const userD = uid();
    await db
      .insertInto("users",)
      .values({
        id: userD,
        username: `u-${userD}`,
        display_name: "U",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const actorD = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorD,
        actor_type: "user",
        display_name: "U",
        user_id: userD,
        owner_id: userD,
        agent_type: "none",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    const chatId = uid();
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Muted World Chat",
        type: "direct",
        mode: "direct",
        created_by: userD,
      },)
      .execute();

    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorD, },)
      .execute();

    await svc.setPrefs(userD, { mutedWorlds: ["w-muted",], },);

    await notifyQuestUpdate(db, { worldId: "w-muted", chatId: chatId, questName: "Q", },);

    expect(await svc.getUnreadCount(userD,),).toBe(0,);
  });

  test("notifyQuestUpdate notifies every recipient even when one insert fails", async () => {
    // Two world participants: one whose user row is gone (the notification
    // insert fails the FK) and one healthy. The recipients are notified
    // independently, so the healthy one still gets its row and the first
    // failure is surfaced to the caller.
    const worldId = "w-parallel";
    const ghostUser = uid();
    const healthyUser = uid();
    const ghostActor = uid();
    const healthyActor = uid();
    const chatId = uid();

    for (const id of [ghostUser, healthyUser,]) {
      await db
        .insertInto("users",)
        .values({
          id,
          username: `u-${id}`,
          display_name: "U",
          role: "solo",
          status: "active",
          settings: "{}",
        },)
        .execute();
    }

    await db
      .insertInto("actors",)
      .values([
        {
          id: ghostActor,
          actor_type: "user",
          display_name: "Ghost",
          user_id: ghostUser,
          owner_id: ghostUser,
          agent_type: "none",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },
        {
          id: healthyActor,
          actor_type: "user",
          display_name: "Healthy",
          user_id: healthyUser,
          owner_id: healthyUser,
          agent_type: "none",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },
      ],)
      .execute();

    await db
      .insertInto("worlds",)
      .values({ id: worldId, owner_id: healthyUser, name: "Parallel World", },)
      .execute();

    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Parallel World Chat",
        type: "direct",
        mode: "direct",
        created_by: healthyUser,
        world_id: worldId,
      },)
      .execute();

    await db
      .insertInto("chat_participants",)
      .values([
        { chat_id: chatId, actor_id: healthyActor, },
        { chat_id: chatId, actor_id: ghostActor, },
      ],)
      .execute();

    // Drop the ghost user with FK enforcement off: the actor keeps a
    // dangling user_id, so the notification insert for it fails. The pragma
    // is restored even if the delete throws - the rest of the file depends on
    // FK enforcement.
    try {
      sqlite.run("PRAGMA foreign_keys = OFF",);
      await db.deleteFrom("users",).where("id", "=", ghostUser,).execute();
    } finally {
      sqlite.run("PRAGMA foreign_keys = ON",);
    }

    const svc = new NotificationService(db,);
    await expect(notifyQuestUpdate(db, { worldId, questName: "Q", },),).rejects.toThrow();
    expect(await svc.getUnreadCount(healthyUser,),).toBe(1,);
  });

  test("buildRecentEventsContext formats", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "t1", link: "/chat/cx", },);
    const ctx = await svc.buildRecentEventsContext(userA, "/chat/cx",);
    expect(ctx,).toContain("[Recent Events]",);
    expect(ctx,).toContain("t1",);
  });

  test("stores a notification with unserializable data as null data", async () => {
    // Own recipient: this test must not perturb the shared fixtures' counts
    // (the file shares one db across its tests).
    const ownUser = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownUser,
        username: `u-${ownUser}`,
        display_name: "U",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    // The payload cannot be serialized - the row is still created and the
    // failure is logged instead of silently dropping the data.
    const svc = new NotificationService(db,);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await svc.create({ userId: ownUser, type: NotificationType.Mention, title: "circular", data: circular, },);

    const items = await svc.list(ownUser,);
    const row = items.find((item,) => item.title === "circular");
    expect(row,).toBeDefined();
    expect(row?.data,).toBeNull();
  });

  test("notifyGmAction notifies every recipient even when one insert fails", async () => {
    // Two world participants: one whose user row is gone (its notification
    // insert fails the FK) and one healthy. The recipients are notified
    // independently, so the healthy one still gets its row and the first
    // failure is surfaced to the caller. The ghost actor id is the smallest
    // possible uuid, so the recipient order (chat_participants is keyed by
    // (chat_id, actor_id)) always puts the failing recipient first - a
    // sequential implementation would abort before the healthy one.
    const local = await createTestDb();
    try {
      const worldId = uid();
      const ghostUser = uid();
      const healthyUser = uid();
      const ghostActor = "00000000-0000-4000-8000-000000000000";
      const healthyActor = uid();
      const chatId = uid();

      for (const id of [ghostUser, healthyUser,]) {
        await local.db
          .insertInto("users",)
          .values({
            id,
            username: `u-${id}`,
            display_name: "U",
            role: "solo",
            status: "active",
            settings: "{}",
          },)
          .execute();
      }

      await local.db
        .insertInto("actors",)
        .values([
          {
            id: ghostActor,
            actor_type: "user",
            display_name: "Ghost",
            user_id: ghostUser,
            owner_id: ghostUser,
            agent_type: "none",
            settings: "{}",
            row_version: 0,
            visibility: "private",
            import_spec: "{}",
          },
          {
            id: healthyActor,
            actor_type: "user",
            display_name: "Healthy",
            user_id: healthyUser,
            owner_id: healthyUser,
            agent_type: "none",
            settings: "{}",
            row_version: 0,
            visibility: "private",
            import_spec: "{}",
          },
        ],)
        .execute();

      await local.db
        .insertInto("worlds",)
        .values({ id: worldId, owner_id: healthyUser, name: "Parallel World", },)
        .execute();

      await local.db
        .insertInto("chats",)
        .values({
          id: chatId,
          name: "Parallel World Chat",
          type: "direct",
          mode: "direct",
          created_by: healthyUser,
          world_id: worldId,
        },)
        .execute();

      await local.db
        .insertInto("chat_participants",)
        .values([
          { chat_id: chatId, actor_id: ghostActor, },
          { chat_id: chatId, actor_id: healthyActor, },
        ],)
        .execute();

      // Drop the ghost user with FK enforcement off: the actor keeps a
      // dangling user_id, so its notification insert fails.
      try {
        local.sqlite.run("PRAGMA foreign_keys = OFF",);
        await local.db.deleteFrom("users",).where("id", "=", ghostUser,).execute();
      } finally {
        local.sqlite.run("PRAGMA foreign_keys = ON",);
      }

      const svc = new NotificationService(local.db,);
      await expect(notifyGmAction(local.db, { worldId, description: "D", },),).rejects.toThrow();
      expect(await svc.getUnreadCount(healthyUser,),).toBe(1,);
    } finally {
      await local.db.destroy();
    }
  });
});
