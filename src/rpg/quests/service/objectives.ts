import type { Kysely, } from "kysely";
import { jsonStringifyOr, } from "../../../utils";
import { parseJsonField, } from "../../shared/rpg-service-utils";
import { getQuest, } from "./crud";
import type { QuestObjective, } from "./types";

/** Get quest objectives from config */
export async function getObjectives(
  db: Kysely<any>,
  questId: string,
): Promise<QuestObjective[]> {
  const quest = await getQuest(db, questId,);
  if (!quest) { return []; }

  const config = parseJsonField<{ objectives?: QuestObjective[] }>(quest.config, {},);
  return config.objectives ?? [];
}

/** Update quest objectives */
export async function updateObjective(
  db: Kysely<any>,
  questId: string,
  objectiveId: string,
  progress: number,
): Promise<QuestObjective[]> {
  const quest = await getQuest(db, questId,);
  if (!quest) { throw new Error("Quest not found",); }

  const config = parseJsonField<{ objectives?: QuestObjective[] }>(quest.config, {},);
  const objectives = config.objectives ?? [];

  const objective = objectives.find((o,) => o.id === objectiveId);
  if (!objective) { throw new Error("Objective not found",); }

  objective.current = Math.min(objective.current + progress, objective.count,);
  objective.completed = objective.current >= objective.count;

  await db
    .updateTable("quests",)
    .set({
      config: jsonStringifyOr({ ...config, objectives, },),
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", questId,)
    .execute();

  return objectives;
}
