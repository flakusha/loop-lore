/**
 * Quest Routes
 *
 * Wire QuestEngine to REST endpoints:
 *   GET    /api/worlds/:id/quests              — list active quests
 *   POST   /api/worlds/:id/quests              — create quest
 *   GET    /api/quests/:questId                     — get single quest
 *   PUT    /api/quests/:questId                     — update quest
 *   DELETE /api/quests/:questId                     — abandon quest
 *   POST   /api/quests/:questId/progress            — advance progress
 *   GET    /api/quests/:questId/progress/:chatId    — get chat progress
 */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { safeJsonStringify } from "../utils";
import { jsonResponse, jsonError, jsonPaginated, jsonCreated, jsonNoContent, HttpStatus } from "./http-utils";
import { QuestEngine } from "../story/quest-engine";
import { notifyQuestUpdate } from "../notifications/service";
import type { QuestType as QuestTypeEnum } from "../db/enums";
import type { QuestConfig } from "../story/types";
import { QuestCreateBody } from "../validation/schemas";
import { notFound } from "../validation/middleware";

// ── Handlers ────────────────────────────────────────────────

async function checkQuestAccess(
  database: Kysely<DB>,
  questId: string,
  userId: string | null,
  userRole: string | null,
) {
  const questRow = await database
    .selectFrom("quests")
    .select(["world_id"])
    .where("id", "=", questId)
    .executeTakeFirst();
  if (!questRow) return null;
  const worldCheck = await database
    .selectFrom("worlds")
    .select(["owner_id"])
    .where("id", "=", questRow.world_id)
    .executeTakeFirst();
  if (!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin")) return null;
  return questRow;
}

async function checkWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldCheck = await database
    .selectFrom("worlds")
    .select(["owner_id"])
    .where("id", "=", worldId)
    .executeTakeFirst();
  return !(!worldCheck || (worldCheck.owner_id !== userId && userRole !== "admin"));
}

async function handleListQuests(
  database: Kysely<DB>,
  worldId: string,
  page: number,
  pageSize: number,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldAccess(database, worldId, userId, userRole))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound });
  }

  const offset = (page - 1) * pageSize;
  const countResult = await database
    .selectFrom("quests")
    .select(database.fn.countAll<number>().as("total"))
    .where("world_id", "=", worldId)
    .where("status", "=", "active")
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const quests = await database
    .selectFrom("quests")
    .selectAll()
    .where("world_id", "=", worldId)
    .where("status", "=", "active")
    .orderBy("priority", "desc")
    .limit(pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated({ data: quests, total, page, pageSize });
}

async function handleCreateQuest(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  body: Record<string, unknown>,
) {
  if (!(await checkWorldAccess(database, worldId, userId, userRole))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound });
  }

  if (!body.name) return jsonError({ message: "name is required", status: HttpStatus.BadRequest });

  const questId = await new QuestEngine(database).createQuest({
    worldId,
    creatorId: userId!,
    name: body.name as string,
    description: (body.description as string) ?? null,
    type: (body.type as QuestTypeEnum) ?? "collection",
    config: (body.config || {}) as unknown as QuestConfig,
    target: Number(body.target) || 10,
    priority: Number(body.priority) || 0,
    deadline: (body.deadline as string) ?? undefined,
    rewards: (body.rewards as Record<string, unknown> | undefined) ?? undefined,
    narrativeHooks: (body.narrativeHooks as { progress: number; narrative: string }[]) ?? undefined,
  });

  return jsonCreated({ id: questId });
}

async function handleQuest(
  database: Kysely<DB>,
  method: string,
  questId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole);
  if (!questRow) return notFound("Quest not found");

  if (method === "GET") {
    const quest = await database
      .selectFrom("quests")
      .selectAll()
      .where("id", "=", questId)
      .executeTakeFirst();
    return quest ? jsonResponse(quest) : notFound("Quest not found");
  }

  const updates: Record<string, unknown> = {};
  if (body?.name != null) updates.name = body.name;
  if (body?.description != null) updates.description = body.description;
  if (body?.priority != null) updates.priority = body.priority;
  if (body?.deadline != null) updates.deadline = body.deadline;
  if (body?.rewards != null) {
    const r = safeJsonStringify(body.rewards);
    if (r.ok) updates.rewards = r.value;
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    await database.updateTable("quests").set(updates).where("id", "=", questId).execute();
  }

  const updated = await database
    .selectFrom("quests")
    .selectAll()
    .where("id", "=", questId)
    .executeTakeFirst();
  void notifyQuestUpdate(database, {
    worldId: questRow.world_id,
    questName: updated?.name ?? "Quest",
  }).catch(() => {});
  return jsonResponse(updated);
}

async function handleAbandonQuest(
  database: Kysely<DB>,
  questId: string,
  userId: string | null,
  userRole: string | null,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole);
  if (!questRow) return notFound("Quest not found");

  const engine = new QuestEngine(database);
  await engine.abandon(questId);
  return jsonNoContent();
}

async function handleProgress(
  database: Kysely<DB>,
  questId: string,
  chatId: string | undefined,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole);
  if (!questRow) return notFound("Quest not found");

  const engine = new QuestEngine(database);
  if (chatId) {
    const progress = await engine.getChatProgress(questId, chatId);
    return jsonResponse(progress ?? { questId, chatId, progress: 0 });
  }

  const delta = Number(body?.delta) || 1;
  const sourceMessageId = body?.sourceMessageId as string | undefined;
  const entry = await engine.advanceProgress(questId, body?.chatId as string, delta, sourceMessageId);
  const questNameRow = await database
    .selectFrom("quests")
    .select("name")
    .where("id", "=", questId)
    .executeTakeFirst();
  void notifyQuestUpdate(database, {
    worldId: questRow.world_id,
    chatId: body?.chatId as string | undefined,
    questName: questNameRow?.name ?? "Quest",
  }).catch(() => {});
  return jsonResponse(entry);
}

// ── Elysia plugin ───────────────────────────────────────────

export function questsRoutes({ database }: { database: Kysely<DB> }): Elysia {
  return new Elysia({ name: "quests" })
    .get("/api/worlds/:id/quests", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleListQuests(
        database,
        ctx.params.id as string,
        Number(ctx.query?.page) || 1,
        Number(ctx.query?.pageSize) || 20,
        userId,
        userRole,
      );
    })
    .post(
      "/api/worlds/:id/quests",
      async (ctx: any) => {
        const userId = ctx.userId as string | null;
        const userRole = ctx.userRole as string | null;
        return handleCreateQuest(
          database,
          ctx.params.id as string,
          userId,
          userRole,
          ctx.body as Record<string, unknown>,
        );
      },
      { body: QuestCreateBody },
    )
    .get("/api/quests/:questId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleQuest(database, "GET", ctx.params.questId as string, userId, userRole);
    })
    .put("/api/quests/:questId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleQuest(
        database,
        "PUT",
        ctx.params.questId as string,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    })
    .delete("/api/quests/:questId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleAbandonQuest(database, ctx.params.questId as string, userId, userRole);
    })
    .post("/api/quests/:questId/progress", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleProgress(
        database,
        ctx.params.questId as string,
        undefined,
        userId,
        userRole,
        ctx.body as Record<string, unknown>,
      );
    })
    .get("/api/quests/:questId/progress/:chatId", async (ctx: any) => {
      const userId = ctx.userId as string | null;
      const userRole = ctx.userRole as string | null;
      return handleProgress(
        database,
        ctx.params.questId as string,
        ctx.params.chatId as string,
        userId,
        userRole,
      );
    }) as unknown as Elysia;
}
