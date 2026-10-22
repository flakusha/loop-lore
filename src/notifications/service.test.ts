import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { NotificationService, NotificationType, notifyMention, notifyQuestUpdate, } from "./service";

describe("NotificationService", () => {
  let db: Kysely<DB>;
  const userA = uid();
  const userB = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
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
});
