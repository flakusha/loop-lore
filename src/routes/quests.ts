/**
 * Quest Routes
 *
 * Wire QuestEngine to REST endpoints:
 *   GET    /api/worlds/:worldId/quests              — list active quests
 *   POST   /api/worlds/:worldId/quests              — create quest
 *   GET    /api/quests/:questId                     — get single quest
 *   PUT    /api/quests/:questId                     — update quest
 *   DELETE /api/quests/:questId                     — abandon quest
 *   POST   /api/quests/:questId/progress            — advance progress
 *   GET    /api/quests/:questId/progress/:chatId    — get chat progress
 */

import { registerRoute, type RouteDispatch } from "./router";
import { safeJsonStringify } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  parseBody,
  parsePagination,
} from "./http-utils";
import { QuestEngine, type QuestProgressEntry } from "../story/quest-engine";
import type { QuestType as QuestTypeEnum } from "../db/enums";
import type { QuestConfig } from "../story/types";

// ── Dispatch ──────────────────────────────────────────────────

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  const engine = new QuestEngine(database);

  // /api/quests/:questId/progress/:chatId
  const progressChatMatch = /^\/api\/quests\/([a-f0-9-]+)\/progress\/([a-f0-9-]+)$/.exec(pathname);
  if (progressChatMatch && method === "GET") {
    const questId = progressChatMatch[1]!;
    const chatId = progressChatMatch[2]!;

    const questRow = await database
      .selectFrom("quests")
      .select(["world_id"])
      .where("id", "=", questId)
      .executeTakeFirst();

    if (!questRow) {
      return jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", questRow.world_id)
      .executeTakeFirst();

    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    const progress = await engine.getChatProgress(questId, chatId);
    return progress ? jsonResponse(progress) : jsonResponse({ questId, chatId, progress: 0 });
  }

  // /api/quests/:questId/progress
  const progressMatch = /^\/api\/quests\/([a-f0-9-]+)\/progress$/.exec(pathname);
  if (progressMatch && method === "POST") {
    const questId = progressMatch[1]!;
    const body = await parseBody(request);
    if (body instanceof Response) return body;

    const questRow = await database
      .selectFrom("quests")
      .select(["world_id", "target"])
      .where("id", "=", questId)
      .executeTakeFirst();

    if (!questRow) {
      return jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", questRow.world_id)
      .executeTakeFirst();

    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    const chatId = body.chatId as string;
    const delta = Number(body.delta) || 1;
    const sourceMessageId = body.sourceMessageId as string | undefined;

    const entry: QuestProgressEntry = await engine.advanceProgress(questId, chatId, delta, sourceMessageId);
    return jsonResponse(entry);
  }

  // /api/quests/:questId
  const singleMatch = /^\/api\/quests\/([a-f0-9-]+)$/.exec(pathname);
  if (singleMatch) {
    const questId = singleMatch[1]!;

    const questRow = await database
      .selectFrom("quests")
      .select(["world_id"])
      .where("id", "=", questId)
      .executeTakeFirst();

    const worldCheck = questRow
      ? await database.selectFrom("worlds").select(["owner_id"]).where("id", "=", questRow.world_id).executeTakeFirst()
      : null;

    if (!questRow || !worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    if (method === "GET") {
      const quest = await database.selectFrom("quests").selectAll().where("id", "=", questId).executeTakeFirst();
      return quest ? jsonResponse(quest) : jsonError({ message: "Quest not found", status: HttpStatus.NotFound });
    }

    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      const updates: Record<string, unknown> = {};

      if (body.name != null) updates.name = body.name;
      if (body.description != null) updates.description = body.description;
      if (body.priority != null) updates.priority = body.priority;
      if (body.deadline != null) updates.deadline = body.deadline;
      if (body.rewards != null) {
        const r = safeJsonStringify(body.rewards);
        if (r.ok) updates.rewards = r.value;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await database.updateTable("quests").set(updates).where("id", "=", questId).execute();
      }

      const updated = await database.selectFrom("quests").selectAll().where("id", "=", questId).executeTakeFirst();
      return jsonResponse(updated);
    }

    if (method === "DELETE") {
      await engine.abandon(questId);
      return jsonNoContent();
    }

    return BAD_METHOD();
  }

  // /api/worlds/:worldId/quests
  const collMatch = /^\/api\/worlds\/([a-f0-9-]+)\/quests$/.exec(pathname);
  if (collMatch) {
    const worldId = collMatch[1]!;

    const worldCheck = await database
      .selectFrom("worlds")
      .select(["owner_id"])
      .where("id", "=", worldId)
      .executeTakeFirst();

    if (!worldCheck || (worldCheck.owner_id !== context.userId && context.userRole !== "admin")) {
      return jsonError({ message: "World not found", status: HttpStatus.NotFound });
    }

    if (method === "GET") {
      const { page, pageSize } = parsePagination(url.searchParams);
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

    if (method === "POST") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;

      if (!body.name) {
        return jsonError({ message: "name is required", status: HttpStatus.BadRequest });
      }

      const questId = await engine.createQuest({
        worldId,
        creatorId: context.userId!,
        name: body.name as string,
        description: (body.description as string) ?? null,
        type: (body.type as unknown as QuestTypeEnum) ?? "collection",
        config: (body.config || {}) as unknown as QuestConfig,
        target: Number(body.target) || 10,
        priority: Number(body.priority) || 0,
        deadline: (body.deadline as string) ?? undefined,
        rewards: (body.rewards as Record<string, unknown> | undefined) ?? undefined,
        narrativeHooks: (body.narrativeHooks as { progress: number; narrative: string }[]) ?? undefined,
      });

      return jsonCreated({ id: questId });
    }

    return BAD_METHOD();
  }

  return null;
};

registerRoute(dispatch);
