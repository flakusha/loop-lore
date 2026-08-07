import type { Kysely, } from "kysely";
import { jsonStringifyOr, } from "../../../utils";
import { parseJsonField, } from "../../shared/rpg-service-utils";
import { getQuest, } from "./crud";
import type { QuestReward, } from "./types";

/** Get quest rewards */
export async function getRewards(
  db: Kysely<any>,
  questId: string,
): Promise<QuestReward[]> {
  const quest = await getQuest(db, questId,);
  if (!quest) { return []; }

  return parseJsonField<QuestReward[]>(quest.rewards, [],);
}

/** Claim a quest reward */
export async function claimReward(
  db: Kysely<any>,
  questId: string,
  rewardIndex: number,
): Promise<QuestReward> {
  const quest = await getQuest(db, questId,);
  if (!quest) { throw new Error("Quest not found",); }

  const rewards = parseJsonField<QuestReward[]>(quest.rewards, [],);
  if (rewardIndex < 0 || rewardIndex >= rewards.length) {
    throw new Error("Invalid reward index",);
  }

  const reward = rewards[rewardIndex];
  if (!reward) { throw new Error("Reward not found",); }
  if (reward.claimed) { throw new Error("Reward already claimed",); }

  reward.claimed = true;

  await db
    .updateTable("quests",)
    .set({
      rewards: jsonStringifyOr(rewards,),
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", questId,)
    .execute();

  return reward;
}
