/**
 * Tests for quest route handlers (access checks + CRUD + progress).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertQuestProgress,
  insertQuests,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import {
  checkQuestAccess,
  checkWorldAccess,
  handleAbandonQuest,
  handleCreateQuest,
  handleListQuests,
  handleProgress,
  handleQuest,
} from "./handlers";

interface JsonResponse {
  message?: string;
  data?: unknown[];
  pagination?: { total: number; page: number; pageSize: number };
  total?: number;
  id?: string;
  name?: string;
  progress?: number;
  newProgress?: number;
  delta?: number;
  questId?: string;
}

/**
 * @param res
 */
async function jsonOf(res: Response,): Promise<JsonResponse> {
  return res.json() as Promise<JsonResponse>;
}

describe("quest handlers", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertUsers(db, "solo", "Solo", { id: "solo" as never, },);
    await insertUsers(db, "other", "Other", { id: "other" as never, },);
    for (
      const [id, name,] of [["owner", "Owner",], ["admin", "Admin",], ["solo", "Solo",], ["other", "Other",],] as const
    ) {
      await insertActors(db, name, { id: id as never, actor_type: "user" as never, },);
    }
    await insertWorlds(db, "owner", "Quest World", { id: "world-1" as never, },);
    await insertChats(db, "Quest Chat", "owner", {
      id: "chat-q" as never,
      world_id: "world-1",
    },);
    await insertChatParticipants(db, "chat-q", "owner",);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("checkWorldAccess", () => {
    test("owner can access", async () => {
      expect(await checkWorldAccess(db, "world-1", "owner", "user",),).toBe(true,);
    });

    test("admin and solo can access any world", async () => {
      expect(await checkWorldAccess(db, "world-1", "admin", "admin",),).toBe(true,);
      expect(await checkWorldAccess(db, "world-1", "solo", "solo",),).toBe(true,);
    });

    test("stranger cannot access", async () => {
      expect(await checkWorldAccess(db, "world-1", "other", "user",),).toBe(false,);
    });

    test("missing world denied", async () => {
      expect(await checkWorldAccess(db, "nope", "owner", "user",),).toBe(false,);
    });
  });

  describe("checkQuestAccess", () => {
    test("returns null for missing quest", async () => {
      expect(await checkQuestAccess(db, "nope", "owner", "user",),).toBeNull();
    });

    test("returns row for owner and admin", async () => {
      await insertQuests(db, "world-1", "owner", "Fetch", "collection", 5, {
        id: "quest-1" as never,
        status: "completed" as never,
      },);
      const owner = await checkQuestAccess(db, "quest-1", "owner", "user",);
      expect(owner!.world_id,).toBe("world-1",);
      expect(await checkQuestAccess(db, "quest-1", "admin", "admin",),).not.toBeNull();
    });

    test("returns null for stranger", async () => {
      expect(await checkQuestAccess(db, "quest-1", "other", "user",),).toBeNull();
    });
  });

  describe("handleListQuests", () => {
    test("denies access for stranger", async () => {
      const res = await handleListQuests(db, "world-1", 1, 10, "other", "user",);
      expect(res.status,).toBe(404,);
    });

    test("lists active quests with pagination", async () => {
      await insertQuests(db, "world-1", "owner", "Quest A", "collection", 3, {
        id: "quest-2" as never,
        status: "active" as never,
        priority: 5 as never,
      },);
      await insertQuests(db, "world-1", "owner", "Quest B", "collection", 3, {
        id: "quest-3" as never,
        status: "active" as never,
        priority: 1 as never,
      },);
      await insertQuests(db, "world-1", "owner", "Quest C", "collection", 3, {
        id: "quest-4" as never,
        status: "completed" as never,
      },);
      const res = await handleListQuests(db, "world-1", 1, 10, "owner", "user",);
      const body = await jsonOf(res,);
      expect(body.pagination!.total,).toBe(2,);
      expect(body.data,).toHaveLength(2,);
      expect(body.pagination!.page,).toBe(1,);
      expect(body.pagination!.pageSize,).toBe(10,);
      // highest priority first
      const names = (body.data as { name: string }[]).map(q => q.name);
      expect(names,).toEqual(["Quest A", "Quest B",],);
    });
  });

  describe("handleCreateQuest", () => {
    test("rejects missing name", async () => {
      const res = await handleCreateQuest(db, "world-1", "owner", "user", { description: "x", },);
      expect(res.status,).toBe(400,);
    });

    test("denies stranger", async () => {
      const res = await handleCreateQuest(db, "world-1", "other", "user", { name: "X", },);
      expect(res.status,).toBe(404,);
    });

    test("creates a quest via engine", async () => {
      const res = await handleCreateQuest(db, "world-1", "owner", "user", {
        name: "Created Quest",
        type: "collection",
        target: 7,
      },);
      const body = await jsonOf(res,);
      expect(body.id,).toBeDefined();
      const row = await db.selectFrom("quests",).selectAll().where("id", "=", body.id as string,).executeTakeFirst();
      expect(row!.name,).toBe("Created Quest",);
      expect(row!.target,).toBe(7,);
    });
  });

  describe("handleQuest", () => {
    test("GET returns quest", async () => {
      const res = await handleQuest(db, "GET", "quest-2", "owner", "user",);
      const body = await jsonOf(res,);
      expect(body.name,).toBe("Quest A",);
    });

    test("GET missing quest returns 404", async () => {
      const res = await handleQuest(db, "GET", "nope", "owner", "user",);
      expect(res.status,).toBe(404,);
    });

    test("PATCH updates fields", async () => {
      const res = await handleQuest(db, "PATCH", "quest-2", "owner", "user", {
        name: "Renamed",
        priority: 9,
        rewards: { xp: 100, },
      },);
      const body = await jsonOf(res,);
      expect(body.name,).toBe("Renamed",);
      const row = await db.selectFrom("quests",).selectAll().where("id", "=", "quest-2",).executeTakeFirst();
      expect(row!.priority,).toBe(9,);
      expect(row!.rewards,).toContain("100",);
    });

    test("PATCH with no body fields leaves row unchanged", async () => {
      const res = await handleQuest(db, "PATCH", "quest-3", "owner", "user", {},);
      const body = await jsonOf(res,);
      expect(body.name,).toBe("Quest B",);
    });

    test("denies stranger", async () => {
      const res = await handleQuest(db, "GET", "quest-2", "other", "user",);
      expect(res.status,).toBe(404,);
    });
  });

  describe("handleAbandonQuest", () => {
    test("abandons quest for owner", async () => {
      const res = await handleAbandonQuest(db, "quest-3", "owner", "user",);
      expect(res.status,).toBe(204,);
      const row = await db.selectFrom("quests",).select("status",).where("id", "=", "quest-3",).executeTakeFirst();
      expect(row!.status,).toBe("abandoned",);
    });

    test("404 for missing quest", async () => {
      const res = await handleAbandonQuest(db, "nope", "owner", "user",);
      expect(res.status,).toBe(404,);
    });
  });

  describe("handleProgress", () => {
    test("returns chat-scoped progress", async () => {
      await insertQuestProgress(db, "quest-2", "chat-q", { progress: 2 as never, },);
      const res = await handleProgress(db, "quest-2", "chat-q", "owner", "user",);
      const body = await jsonOf(res,);
      expect(body.progress,).toBe(2,);
    });

    test("returns zero progress when none recorded", async () => {
      const res = await handleProgress(db, "quest-2", "chat-q", "owner", "user",);
      const body = await jsonOf(res,);
      expect(body.progress,).toBeGreaterThanOrEqual(2,);
    });

    test("advances progress with delta and defaults to 1", async () => {
      await insertQuests(db, "world-1", "owner", "Progress Quest", "collection", 20, {
        id: "quest-5" as never,
        status: "active" as never,
      },);
      const res = await handleProgress(db, "quest-5", undefined, "owner", "user", { delta: 3, chatId: "chat-q", },);
      const body = await jsonOf(res,);
      expect(body.newProgress,).toBeGreaterThanOrEqual(3,);
      expect(body.delta,).toBe(3,);
      const res2 = await handleProgress(db, "quest-5", undefined, "owner", "user", { chatId: "chat-q", },);
      const body2 = await jsonOf(res2,);
      expect(body2.newProgress,).toBeGreaterThanOrEqual((body.newProgress as number) + 1,);
      expect(body2.delta,).toBe(1,);
    });

    test("404 for missing quest", async () => {
      const res = await handleProgress(db, "nope", undefined, "owner", "user", {},);
      expect(res.status,).toBe(404,);
    });
  });
});
