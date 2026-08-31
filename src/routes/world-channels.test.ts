/**
 * Route tests for chat-only world channels: world access widening
 * (owner/admin/member/public) and GET /api/worlds/:worldId/chats grouped
 * enumeration.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { worldsRoutes, } from "./worlds";

interface ChannelRow {
  id: string;
  current_location_id: string | null;
  location_name: string | null;
}

const mockConfig = {} as any;

describe("world channels routes", () => {
  let db: Kysely<DB>;
  const ownerId = "wc-owner";
  const memberId = "wc-member";
  const outsiderId = "wc-outsider";
  const worldId = "wc-world";
  const locA = "wc-loc-a";
  const locB = "wc-loc-b";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertUsers(db, "member", "Member", { id: memberId, } as never,);
    await insertActors(db, "Member", { id: memberId, user_id: memberId, owner_id: memberId, } as never,);
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);
    await insertActors(db, "Outsider", { id: outsiderId, user_id: outsiderId, owner_id: outsiderId, } as never,);

    await insertWorlds(db, ownerId, "Channel World", { id: worldId, kind: "chat", visibility: "private", } as never,);
    await insertLocations(db, worldId, "General", { id: locA, } as never,);
    await insertLocations(db, worldId, "Off-topic", { id: locB, } as never,);

    // MemberWorld joins the world.
    await insertWorldMembers(db, worldId, memberId,);

    // Two chats, one per location, joined by both the owner and the member.
    await insertChats(
      db,
      "general",
      ownerId,
      { id: "wc-chat-a", world_id: worldId, current_location_id: locA, } as never,
    );
    await insertChats(
      db,
      "offtopic",
      ownerId,
      { id: "wc-chat-b", world_id: worldId, current_location_id: locB, } as never,
    );
    await insertChatParticipants(db, "wc-chat-a", ownerId,);
    await insertChatParticipants(db, "wc-chat-b", ownerId,);
    await insertChatParticipants(db, "wc-chat-a", memberId,);
    await insertChatParticipants(db, "wc-chat-b", memberId,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * Mount worlds routes behind stub auth derive.
   * @param userId
   * @param userRole
   */
  function authedApp(userId: string, userRole = "user",): Elysia {
    return new Elysia({ name: "test-wc-auth", },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(worldsRoutes({ database: db, config: mockConfig, },),) as any;
  }

  /**
   * @param app
   * @param wid
   * @param query
   */
  function getWorldChats(app: Elysia, wid = worldId, query = "",): Promise<Response> {
    return app.handle(new Request(`http://localhost/api/worlds/${wid}/chats${query}`,),);
  }

  test("private world is 404 for a non-member", async () => {
    const res = await getWorldChats(authedApp(outsiderId,),);
    expect(res.status,).toBe(404,);
  });

  test("owner lists world chats grouped by location", async () => {
    const res = await getWorldChats(authedApp(ownerId,),);
    expect(res.status,).toBe(200,);
    const { data, } = (await res.json()) as { data: ChannelRow[] };
    expect(data.some((c,) => c.id === "wc-chat-a"),).toBe(true,);
    expect(data.some((c,) => c.id === "wc-chat-b"),).toBe(true,);
  });

  test("member lists chats where they participate", async () => {
    const res = await getWorldChats(authedApp(memberId,),);
    expect(res.status,).toBe(200,);
    const { data, } = (await res.json()) as { data: ChannelRow[] };
    expect(data,).toHaveLength(2,);
    expect(data.map((c,) => c.location_name).includes("General",),).toBe(true,);
    expect(data.map((c,) => c.location_name).includes("Off-topic",),).toBe(true,);
  });

  test("locationId filter narrows to one channel", async () => {
    const res = await getWorldChats(authedApp(memberId,), worldId, `?locationId=${locA}`,);
    expect(res.status,).toBe(200,);
    const { data, } = (await res.json()) as { data: ChannelRow[] };
    expect(data,).toHaveLength(1,);
    expect(data[0]!.id,).toBe("wc-chat-a",);
  });

  test("member cannot see a chat they are not a participant of", async () => {
    await insertChats(
      db,
      "private-side",
      ownerId,
      { id: "wc-chat-c", world_id: worldId, current_location_id: locB, } as never,
    );
    const res = await getWorldChats(authedApp(memberId,),);
    expect(res.status,).toBe(200,);
    const { data, } = (await res.json()) as { data: ChannelRow[] };
    expect(data.some((c,) => c.id === "wc-chat-c"),).toBe(false,);
  });

  test("public world is reachable by any authenticated user", async () => {
    await insertWorlds(db, ownerId, "Public World", { id: "wc-public", kind: "chat", visibility: "public", } as never,);
    await insertLocations(db, "wc-public", "Lobby", { id: "wc-pub-loc", } as never,);

    const res = await getWorldChats(authedApp(outsiderId,), "wc-public",);
    expect(res.status,).toBe(200,);
  });
});
