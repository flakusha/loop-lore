// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Quest-update notifications honour the recipient's world mute
 *
 * A quest update notifies every participant of the quest's world. The
 * notification must carry the world id, otherwise a recipient who muted that
 * world still gets the row. Driven over HTTP: the mute is set through
 * PATCH /api/v1/notifications/preferences and the update through
 * PUT /api/v1/quests/:id.
 *
 * The sessions are minted directly (see helpers/session.ts): the login
 * endpoint is rate limited per IP process-wide, so in a full-suite run the
 * shared budget would be exhausted here.
 */

import { ChatMode, ChatType, NotificationType, UserRole, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";
import { createTestSession, } from "../helpers/session";

/** Chat that carries the world's participants. */
const WORLD_CHAT_ID = "a0000020-0000-4000-a000-000000000000";

/**
 * Wait until a notification of the given type exists for the user.
 * @param server
 * @param userId
 * @param type - the notification type to wait for
 * @returns the row count once it appears (0 when it never does)
 */
async function waitForNotification(
  server: TestServer,
  userId: string,
  type: NotificationType,
): Promise<number> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const row = await server.db
      .selectFrom("notifications",)
      .select((eb,) => eb.fn.countAll<number>().as("count",))
      .where("user_id", "=", userId,)
      .where("type", "=", type,)
      .executeTakeFirst();

    const count = row?.count ?? 0;
    if (count > 0) { return count; }

    await new Promise((resolve,) => setTimeout(resolve, 50,));
  }

  return 0;
}

describe("Quest update notification world mute E2E", () => {
  let server: TestServer;
  let adminApi: ApiClient;
  let ownerApi: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);

    // Both the world owner and the admin take part in a chat of the world -
    // world participants are the notification recipients.
    await server.db
      .insertInto("chats",)
      .values({
        id: WORLD_CHAT_ID,
        name: "E2E World Chat",
        type: ChatType.Direct,
        mode: ChatMode.Story,
        created_by: SEED.user.id,
        world_id: SEED.world.id,
      },)
      .execute();

    await server.db
      .insertInto("chat_participants",)
      .values([
        { chat_id: WORLD_CHAT_ID, actor_id: SEED.user.id, role_in_chat: "owner", },
        { chat_id: WORLD_CHAT_ID, actor_id: SEED.admin.id, role_in_chat: "member", },
      ],)
      .execute();

    adminApi = createClient(server.url,);
    ownerApi = createClient(server.url,);

    adminApi.setToken((await createTestSession(server.db, SEED.admin.id, UserRole.Admin,)).token,);
    ownerApi.setToken((await createTestSession(server.db, SEED.user.id, UserRole.User,)).token,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  test("a quest update skips the recipient who muted the world", async () => {
    // The admin mutes the world over HTTP.
    const prefs = await adminApi.patch("/api/v1/notifications/preferences", {
      mutedWorlds: [SEED.world.id,],
    },);

    expect(prefs.status,).toBe(200,);

    // The world owner renames the quest -> every world participant is notified.
    const updated = await ownerApi.put(`/api/v1/quests/${SEED.quest.id}`, {
      name: "Renamed by e2e",
    },);

    expect(updated.status,).toBe(200,);

    // The un-muted owner got the notification ...
    expect(await waitForNotification(server, SEED.user.id, NotificationType.QuestUpdate,),).toBeGreaterThan(0,);

    // ... the muted admin did not.
    const muted = await server.db
      .selectFrom("notifications",)
      .selectAll()
      .where("user_id", "=", SEED.admin.id,)
      .where("type", "=", NotificationType.QuestUpdate,)
      .execute();

    expect(muted,).toHaveLength(0,);
  });

  test("a GM action skips the recipient who muted the world", async () => {
    // The GM action route notifies every participant of the action's world.
    await server.db
      .insertInto("npc_states",)
      .values({ id: crypto.randomUUID(), actor_id: SEED.character.id, world_id: SEED.world.id, health: 100, },)
      .execute();

    const prefs = await adminApi.patch("/api/v1/notifications/preferences", {
      mutedWorlds: [SEED.world.id,],
    },);

    expect(prefs.status,).toBe(200,);

    const updated = await ownerApi.put(
      `/api/v1/worlds/${SEED.world.id}/npc-states/${SEED.character.id}`,
      { npc_id: SEED.character.id, state_key: "status", state_value: "resting", },
    );

    expect(updated.status,).toBe(200,);

    expect(await waitForNotification(server, SEED.user.id, NotificationType.GmAction,),).toBeGreaterThan(0,);

    const muted = await server.db
      .selectFrom("notifications",)
      .selectAll()
      .where("user_id", "=", SEED.admin.id,)
      .where("type", "=", NotificationType.GmAction,)
      .execute();

    expect(muted,).toHaveLength(0,);
  });
});
