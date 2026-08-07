import type { Kysely, } from "kysely";
import { QuestStatus, QuestType, } from "../../../db/enums-story";
import { jsonStringifyOr, } from "../../../utils";
import { assertRowUpdated, } from "../../shared/rpg-service-utils";
import type { CreateQuestInput, QuestRow, UpdateQuestInput, } from "./types";

/** Create a new quest */
export async function createQuest(
  db: Kysely<any>,
  input: CreateQuestInput,
): Promise<QuestRow> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const questData = {
    id,
    world_id: input.world_id,
    creator_id: input.creator_id,
    name: input.name,
    description: input.description ?? null,
    type: input.type ?? QuestType.Discovery,
    status: QuestStatus.Active,
    priority: input.priority ?? 50,
    config: jsonStringifyOr({
      objectives: input.objectives ?? [],
    },),
    progress: 0,
    target: input.target ?? 1,
    start_time: now,
    deadline: input.deadline ?? null,
    time_location_id: input.time_location_id ?? null,
    rewards: jsonStringifyOr(input.rewards ?? [],),
    narrative_hooks: "[]",
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  await db.insertInto("quests",).values(questData,).execute();
  return questData;
}

/** Get a quest by ID */
export async function getQuest(db: Kysely<any>, questId: string,): Promise<QuestRow | null> {
  const quest = await db
    .selectFrom("quests",)
    .where("id", "=", questId,)
    .selectAll()
    .executeTakeFirst();

  return (quest as QuestRow) ?? null;
}

/** List quests for a world */
export async function listQuests(
  db: Kysely<any>,
  worldId: string,
  status?: QuestStatus,
): Promise<QuestRow[]> {
  let query = db
    .selectFrom("quests",)
    .where("world_id", "=", worldId,)
    .orderBy("priority", "desc",)
    .orderBy("created_at", "desc",);

  if (status) {
    query = query.where("status", "=", status,);
  }

  const quests = await query.selectAll().execute();
  return quests as QuestRow[];
}

/** Update a quest */
export async function updateQuest(
  db: Kysely<any>,
  questId: string,
  input: UpdateQuestInput,
): Promise<QuestRow> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at: now,
  };

  if (input.name !== undefined) { updates.name = input.name; }
  if (input.description !== undefined) { updates.description = input.description; }
  if (input.type !== undefined) { updates.type = input.type; }
  if (input.priority !== undefined) { updates.priority = input.priority; }
  if (input.target !== undefined) { updates.target = input.target; }
  if (input.deadline !== undefined) { updates.deadline = input.deadline; }
  if (input.time_location_id !== undefined) { updates.time_location_id = input.time_location_id; }

  const result = await db
    .updateTable("quests",)
    .set(updates,)
    .where("id", "=", questId,)
    .executeTakeFirst();

  assertRowUpdated(Number(result.numUpdatedRows,), "Quest",);
  return (await getQuest(db, questId,))!;
}

/** Delete a quest */
export async function deleteQuest(db: Kysely<any>, questId: string,): Promise<void> {
  // Delete associated progress first
  await db
    .deleteFrom("quest_progress",)
    .where("quest_id", "=", questId,)
    .execute();

  const result = await db
    .deleteFrom("quests",)
    .where("id", "=", questId,)
    .executeTakeFirst();

  assertRowUpdated(Number(result.numDeletedRows,), "Quest",);
}
