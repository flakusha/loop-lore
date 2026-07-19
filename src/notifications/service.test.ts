import { beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { createLogger } from "../logger";
import { createTestDb } from "../test-utils/create-test-db";
import { uid } from "../utils";
import { NotificationService, NotificationType, notifyMention } from "./service";

describe("NotificationService", () => {
  let db: Kysely<DB>;
  const userA = uid();
  const userB = uid();

  beforeAll(async () => {
    createLogger({ level: "error" });
    ({ db } = await createTestDb());
    for (const id of [userA, userB]) {
      await db
        .insertInto("users")
        .values({
          id,
          username: `u-${id}`,
          display_name: "U",
          role: "solo",
          status: "active",
          settings: "{}",
        })
        .execute();
    }
  });

  test("create + list + unread count", async () => {
    const svc = new NotificationService(db);
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "Hi", link: "/chat/x" });
    expect(await svc.getUnreadCount(userA)).toBe(1);
    const items = await svc.list(userA);
    expect(items.length).toBe(1);
    expect(items[0]!.type).toBe("mention");
  });

  test("mark read + mark all read", async () => {
    const svc = new NotificationService(db);
    await svc.create({ userId: userA, type: NotificationType.System, title: "S" });
    const items = await svc.list(userA, true);
    const id = items[0]!.id;
    await svc.markRead(id, userA);
    expect(await svc.getUnreadCount(userA)).toBe(1); // one mention still unread
    await svc.markAllRead(userA);
    expect(await svc.getUnreadCount(userA)).toBe(0);
  });

  test("delete", async () => {
    const svc = new NotificationService(db);
    await svc.create({ userId: userB, type: NotificationType.ChatInvite, title: "inv" });
    const items = await svc.list(userB);
    await svc.delete(items[0]!.id, userB);
    expect(await svc.getUnreadCount(userB)).toBe(0);
  });

  test("preferences default + toggle", async () => {
    const svc = new NotificationService(db);
    const prefs = await svc.getPrefs(userA);
    expect(prefs.enabled[NotificationType.Mention]).toBe(true);
    expect(prefs.enabled[NotificationType.WorldEvent]).toBe(false);
    const updated = await svc.setPrefs(userA, { enabled: { [NotificationType.WorldEvent]: true } });
    expect(updated.enabled[NotificationType.WorldEvent]).toBe(true);
  });

  test("disabled type is skipped", async () => {
    const svc = new NotificationService(db);
    await svc.setPrefs(userA, { enabled: { [NotificationType.Mention]: false } });
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "x" });
    expect(await svc.getUnreadCount(userA)).toBe(0);
    await svc.setPrefs(userA, { enabled: { [NotificationType.Mention]: true } });
  });

  test("world mute skips notification", async () => {
    const svc = new NotificationService(db);
    await svc.setPrefs(userB, { mutedWorlds: ["w1"] });
    await svc.create({ userId: userB, type: NotificationType.GmAction, title: "g", worldId: "w1" });
    expect(await svc.getUnreadCount(userB)).toBe(0);
    await svc.setPrefs(userB, { mutedWorlds: [] });
  });

  test("notifyMention notifies mentioned actor only", async () => {
    const svc = new NotificationService(db);
    await notifyMention(db, {
      chatId: "c1",
      senderId: userA,
      mentionedActorIds: [userB],
      messageId: "m1",
    });
    expect(await svc.getUnreadCount(userB)).toBe(1);
    expect(await svc.getUnreadCount(userA)).toBe(0);
  });

  test("buildRecentEventsContext formats", async () => {
    const svc = new NotificationService(db);
    await svc.create({ userId: userA, type: NotificationType.Mention, title: "t1", link: "/chat/cx" });
    const ctx = await svc.buildRecentEventsContext(userA, "/chat/cx");
    expect(ctx).toContain("[Recent Events]");
    expect(ctx).toContain("t1");
  });
});
