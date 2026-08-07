/**
 * Quest Service — Core quest management
 *
 * Handles quest CRUD, state transitions, objectives tracking,
 * and integration with other RPG systems.
 *
 * The concrete CRUD / progression / objectives / rewards logic lives in
 * isolated dispatcher modules (crud, progression, objectives, rewards) threaded
 * with an explicit `db` handle. `QuestService` remains a class so its methods
 * stay on the prototype.
 */
import type { Kysely, } from "kysely";
import type { QuestStatus, } from "../../../db/enums-story";
import { getDatabase, } from "../../../db/index";
import {
  createQuest as createQuestDispatch,
  deleteQuest as deleteQuestDispatch,
  getQuest as getQuestDispatch,
  listQuests as listQuestsDispatch,
  updateQuest as updateQuestDispatch,
} from "./crud";
import { getObjectives as getObjectivesDispatch, updateObjective as updateObjectiveDispatch, } from "./objectives";
import {
  canTransition as canTransitionDispatch,
  getAvailableTransitions as getAvailableTransitionsDispatch,
  transitionQuest as transitionQuestDispatch,
  updateProgress as updateProgressDispatch,
} from "./progression";
import { claimReward as claimRewardDispatch, getRewards as getRewardsDispatch, } from "./rewards";
import type {
  CreateQuestInput,
  QuestObjective,
  QuestReward,
  QuestRow,
  QuestTransitionResult,
  UpdateQuestInput,
} from "./types";

export type {
  CreateQuestInput,
  QuestObjective,
  QuestReward,
  QuestRow,
  QuestTransitionResult,
  UpdateQuestInput,
} from "./types";

/** Quest Service */
export class QuestService {
  private db: Kysely<any>;

  constructor(db?: Kysely<any>,) {
    this.db = db ?? getDatabase();
  }

  /** Create a new quest */
  async createQuest(input: CreateQuestInput,): Promise<QuestRow> {
    return createQuestDispatch(this.db, input,);
  }

  /** Get a quest by ID */
  async getQuest(questId: string,): Promise<QuestRow | null> {
    return getQuestDispatch(this.db, questId,);
  }

  /** List quests for a world */
  async listQuests(worldId: string, status?: QuestStatus,): Promise<QuestRow[]> {
    return listQuestsDispatch(this.db, worldId, status,);
  }

  /** Update a quest */
  async updateQuest(questId: string, input: UpdateQuestInput,): Promise<QuestRow> {
    return updateQuestDispatch(this.db, questId, input,);
  }

  /** Delete a quest */
  async deleteQuest(questId: string,): Promise<void> {
    return deleteQuestDispatch(this.db, questId,);
  }

  /** Transition quest state */
  async transitionQuest(questId: string, to: QuestStatus,): Promise<QuestTransitionResult> {
    return transitionQuestDispatch(this.db, questId, to,);
  }

  /** Update quest progress */
  async updateProgress(questId: string, increment = 1,): Promise<QuestRow> {
    return updateProgressDispatch(this.db, questId, increment,);
  }

  /** Get quest objectives from config */
  async getObjectives(questId: string,): Promise<QuestObjective[]> {
    return getObjectivesDispatch(this.db, questId,);
  }

  /** Update quest objectives */
  async updateObjective(
    questId: string,
    objectiveId: string,
    progress: number,
  ): Promise<QuestObjective[]> {
    return updateObjectiveDispatch(this.db, questId, objectiveId, progress,);
  }

  /** Get quest rewards */
  async getRewards(questId: string,): Promise<QuestReward[]> {
    return getRewardsDispatch(this.db, questId,);
  }

  /** Claim a quest reward */
  async claimReward(questId: string, rewardIndex: number,): Promise<QuestReward> {
    return claimRewardDispatch(this.db, questId, rewardIndex,);
  }

  /** Check if quest can transition to a state */
  canTransition(from: QuestStatus, to: QuestStatus,): boolean {
    return canTransitionDispatch(this.db, from, to,);
  }

  /** Get available transitions for a quest */
  async getAvailableTransitions(questId: string,): Promise<QuestStatus[]> {
    return getAvailableTransitionsDispatch(this.db, questId,);
  }
}
