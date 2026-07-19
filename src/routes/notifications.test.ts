import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { NotificationService, NotificationType, } from "../notifications/service";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { notificationsRoutes, } from "./notifications";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-notifications", },)
    .derive(() => ({ userId, }))
    .use(notificationsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("notificationsRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `u-${userId}`,
        display_name: "U",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
  },);

  test("401 without user", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/notifications",),);
    expect(res.status,).toBe(401,);
  });

  test("list empty + unread-count", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/notifications",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items,).toBeInstanceOf(Array,);
    const c = await app.handle(new Request("http://localhost/api/notifications/unread-count",),);
    const cBody = (await c.json()) as { count: number };
    expect(cBody.count,).toBe(0,);
  });

  test("create via service, then mark read + delete via routes", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId, type: NotificationType.Mention, title: "hi", link: "/chat/x", },);
    const app = createApp(db, userId,);

    const listRes = await app.handle(new Request("http://localhost/api/notifications?unread=true",),);
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.length,).toBe(1,);
    const id = list.items[0]!.id;

    const mk = await app.handle(
      new Request(`http://localhost/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ read: true, },),
      },),
    );
    expect(mk.status,).toBe(200,);
    const countRes = await app.handle(new Request("http://localhost/api/notifications/unread-count",),);
    const countBody = (await countRes.json()) as { count: number };
    expect(countBody.count,).toBe(0,);

    const del = await app.handle(
      new Request(`http://localhost/api/notifications/${id}`, { method: "DELETE", },),
    );
    expect(del.status,).toBe(200,);
  });

  test("read-all clears unread", async () => {
    const svc = new NotificationService(db,);
    await svc.create({ userId, type: NotificationType.System, title: "a", },);
    await svc.create({ userId, type: NotificationType.System, title: "b", },);
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/notifications/read-all", { method: "PATCH", },),
    );
    expect(res.status,).toBe(200,);
    const countRes = await app.handle(new Request("http://localhost/api/notifications/unread-count",),);
    const countBody = (await countRes.json()) as { count: number };
    expect(countBody.count,).toBe(0,);
  });

  test("preferences get + patch", async () => {
    const app = createApp(db, userId,);
    const prefsRes = await app.handle(new Request("http://localhost/api/notifications/preferences",),);
    const get = (await prefsRes.json()) as { enabled: Record<string, boolean> };
    expect(get.enabled.mention,).toBe(true,);
    const patch = await app.handle(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ enabled: { world_event: true, }, },),
      },),
    );
    expect(patch.status,).toBe(200,);
    const updatedRes = await app.handle(new Request("http://localhost/api/notifications/preferences",),);
    const updated = (await updatedRes.json()) as { enabled: Record<string, boolean> };
    expect(updated.enabled.world_event,).toBe(true,);
  });
});
