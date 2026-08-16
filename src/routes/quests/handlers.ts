// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { QuestCategory as QuestCategoryEnum, QuestType as QuestTypeEnum, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { notifyQuestUpdate, } from "../../notifications/service";
import { QuestEngine, } from "../../story/quest-engine";
import type { QuestConfig, } from "../../story/types";
import { safeJsonStringify, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonPaginated, jsonResponse, } from "../http-utils";

export async function checkQuestAccess(
  database: Kysely<DB>,
  questId: string,
  userId: string | null,
  userRole: string | null,
) {
  const questRow = await database
    .selectFrom("quests",)
    .select(["world_id",],)
    .where("id", "=", questId,)
    .executeTakeFirst();
  if (!questRow) { return null; }
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", questRow.world_id,)
    .executeTakeFirst();
  if (!worldCheck || (userRole !== "admin" && userRole !== "solo" && worldCheck.owner_id !== userId)) { return null; }
  return questRow;
}

export async function checkWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  return !(!worldCheck || (userRole !== "admin" && userRole !== "solo" && worldCheck.owner_id !== userId));
}

export async function handleListQuests(
  database: Kysely<DB>,
  worldId: string,
  page: number,
  pageSize: number,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldAccess(database, worldId, userId, userRole,))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
  }

  const offset = (page - 1) * pageSize;
  const countResult = await database
    .selectFrom("quests",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("world_id", "=", worldId,)
    .where("status", "=", "active",)
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const quests = await database
    .selectFrom("quests",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("status", "=", "active",)
    .orderBy("priority", "desc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  return jsonPaginated({ data: quests, total, page, pageSize, },);
}

export async function handleCreateQuest(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  body: Record<string, unknown>,
) {
  if (!(await checkWorldAccess(database, worldId, userId, userRole,))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
  }

  if (!body.name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }

  const questId = await new QuestEngine(database,).createQuest({
    worldId,
    creatorId: userId!,
    name: body.name as string,
    description: (body.description as string) ?? null,
    type: (body.type as QuestTypeEnum) ?? "collection",
    category: (body.category as QuestCategoryEnum) ?? "side",
    config: (body.config || {}) as unknown as QuestConfig,
    target: Number(body.target,) || 10,
    priority: Number(body.priority,) || 0,
    deadline: (body.deadline as string) ?? undefined,
    rewards: (body.rewards as Record<string, unknown> | undefined) ?? undefined,
    narrativeHooks: (body.narrativeHooks as { progress: number; narrative: string }[]) ?? undefined,
  },);

  return jsonCreated({ id: questId, },);
}

export async function handleQuest(
  database: Kysely<DB>,
  method: string,
  questId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole,);
  if (!questRow) { return notFound("Quest not found",); }

  if (method === "GET") {
    const quest = await database
      .selectFrom("quests",)
      .selectAll()
      .where("id", "=", questId,)
      .executeTakeFirst();
    return quest ? jsonResponse(quest,) : notFound("Quest not found",);
  }

  const updates: Record<string, unknown> = {};
  if (body?.name != null) { updates.name = body.name; }
  if (body?.description != null) { updates.description = body.description; }
  if (body?.priority != null) { updates.priority = body.priority; }
  if (body?.deadline != null) { updates.deadline = body.deadline; }
  if (body?.rewards != null) {
    const r = safeJsonStringify(body.rewards,);
    if (r.ok) { updates.rewards = r.value; }
  }

  if (Object.keys(updates,).length > 0) {
    updates.updated_at = new Date().toISOString();
    await database.updateTable("quests",).set(updates,).where("id", "=", questId,).execute();
  }

  const updated = await database
    .selectFrom("quests",)
    .selectAll()
    .where("id", "=", questId,)
    .executeTakeFirst();
  void notifyQuestUpdate(database, {
    worldId: questRow.world_id,
    questName: updated?.name ?? "Quest",
  },)
    // Quest-update notification failure is non-fatal — swallow.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    .catch(() => {},);
  return jsonResponse(updated,);
}

export async function handleAbandonQuest(
  database: Kysely<DB>,
  questId: string,
  userId: string | null,
  userRole: string | null,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole,);
  if (!questRow) { return notFound("Quest not found",); }

  const engine = new QuestEngine(database,);
  await engine.abandon(questId,);
  return jsonNoContent();
}

export async function handleProgress(
  database: Kysely<DB>,
  questId: string,
  chatId: string | undefined,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  const questRow = await checkQuestAccess(database, questId, userId, userRole,);
  if (!questRow) { return notFound("Quest not found",); }

  const engine = new QuestEngine(database,);
  if (chatId) {
    const progress = await engine.getChatProgress(questId, chatId,);
    return jsonResponse(progress ?? { questId, chatId, progress: 0, },);
  }

  const delta = Number(body?.delta,) || 1;
  const sourceMessageId = body?.sourceMessageId as string | undefined;
  const entry = await engine.advanceProgress(questId, body?.chatId as string, delta, sourceMessageId,);
  const questNameRow = await database
    .selectFrom("quests",)
    .select("name",)
    .where("id", "=", questId,)
    .executeTakeFirst();
  void notifyQuestUpdate(database, {
    worldId: questRow.world_id,
    chatId: body?.chatId as string | undefined,
    questName: questNameRow?.name ?? "Quest",
  },)
    // Quest-progress notification failure is non-fatal — swallow.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    .catch(() => {},);
  return jsonResponse(entry,);
}
