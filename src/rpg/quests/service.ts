/**
 * Quest Service — Core quest management
 *
 * Handles quest CRUD, state transitions, objectives tracking,
 * and integration with other RPG systems.
 */
import type { Kysely, } from "kysely";
import { QuestStatus, QuestType, } from "../../db/enums-story";
import { getDatabase, } from "../../db/index";
import { assertRowUpdated, parseJsonField, } from "../shared/rpg-service-utils";

/** Quest data from the database */
export interface QuestRow {
  id: string;
  world_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  priority: number;
  config: string;
  progress: number;
  target: number;
  start_time: string | null;
  deadline: string | null;
  time_location_id: string | null;
  rewards: string;
  narrative_hooks: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Quest objective definition */
export interface QuestObjective {
  id: string;
  type: "kill" | "collect" | "talk" | "explore" | "craft" | "custom";
  target: string;
  count: number;
  current: number;
  completed: boolean;
}

/** Quest reward definition */
export interface QuestReward {
  type: "experience" | "item" | "currency" | "reputation" | "unlock";
  value: unknown;
  claimed: boolean;
}

/** Quest creation input */
export interface CreateQuestInput {
  world_id: string;
  creator_id: string;
  name: string;
  description?: string;
  type?: QuestType;
  priority?: number;
  target?: number;
  objectives?: QuestObjective[];
  rewards?: QuestReward[];
  deadline?: string;
  time_location_id?: string;
}

/** Quest update input */
export interface UpdateQuestInput {
  name?: string;
  description?: string;
  type?: QuestType;
  priority?: number;
  target?: number;
  deadline?: string;
  time_location_id?: string;
}

/** Quest state transition result */
export interface QuestTransitionResult {
  success: boolean;
  from: QuestStatus;
  to: QuestStatus;
  quest: QuestRow;
  errors: string[];
}

/** Valid quest state transitions (matches questStatusMachine in enums-story.ts) */
const QUEST_TRANSITIONS: Record<QuestStatus, QuestStatus[]> = {
  [QuestStatus.Active]: [QuestStatus.Completed, QuestStatus.Failed, QuestStatus.Abandoned,],
  [QuestStatus.Completed]: [],
  [QuestStatus.Failed]: [],
  [QuestStatus.Abandoned]: [QuestStatus.Active,],
};

/** Quest Service */
export class QuestService {
  private db: Kysely<any>;

  constructor(db?: Kysely<any>,) {
    this.db = db ?? getDatabase();
  }

  /** Create a new quest */
  async createQuest(input: CreateQuestInput,): Promise<QuestRow> {
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
      config: JSON.stringify({
        objectives: input.objectives ?? [],
      },),
      progress: 0,
      target: input.target ?? 1,
      start_time: now,
      deadline: input.deadline ?? null,
      time_location_id: input.time_location_id ?? null,
      rewards: JSON.stringify(input.rewards ?? [],),
      narrative_hooks: "[]",
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    await this.db.insertInto("quests",).values(questData,).execute();
    return questData as QuestRow;
  }

  /** Get a quest by ID */
  async getQuest(questId: string,): Promise<QuestRow | null> {
    const quest = await this.db
      .selectFrom("quests",)
      .where("id", "=", questId,)
      .selectAll()
      .executeTakeFirst();

    return (quest as QuestRow) ?? null;
  }

  /** List quests for a world */
  async listQuests(worldId: string, status?: QuestStatus,): Promise<QuestRow[]> {
    let query = this.db
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
  async updateQuest(questId: string, input: UpdateQuestInput,): Promise<QuestRow> {
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

    const result = await this.db
      .updateTable("quests",)
      .set(updates,)
      .where("id", "=", questId,)
      .executeTakeFirst();

    assertRowUpdated(Number(result.numUpdatedRows,), "Quest",);
    return (await this.getQuest(questId,))!;
  }

  /** Delete a quest */
  async deleteQuest(questId: string,): Promise<void> {
    // Delete associated progress first
    await this.db
      .deleteFrom("quest_progress",)
      .where("quest_id", "=", questId,)
      .execute();

    const result = await this.db
      .deleteFrom("quests",)
      .where("id", "=", questId,)
      .executeTakeFirst();

    assertRowUpdated(Number(result.numDeletedRows,), "Quest",);
  }

  /** Transition quest state */
  async transitionQuest(questId: string, to: QuestStatus,): Promise<QuestTransitionResult> {
    const quest = await this.getQuest(questId,);
    if (!quest) {
      return {
        success: false,
        from: QuestStatus.Active,
        to,
        quest: {} as QuestRow,
        errors: ["Quest not found",],
      };
    }

    const from = quest.status as QuestStatus;
    const allowed = QUEST_TRANSITIONS[from] ?? [];

    if (!allowed.includes(to,)) {
      return {
        success: false,
        from,
        to,
        quest,
        errors: [`Invalid transition: ${from} → ${to}`,],
      };
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: to,
      updated_at: now,
    };

    if (to === QuestStatus.Completed) {
      updates.completed_at = now;
      updates.progress = quest.target;
    }

    await this.db
      .updateTable("quests",)
      .set(updates,)
      .where("id", "=", questId,)
      .execute();

    const updatedQuest = (await this.getQuest(questId,))!;

    return {
      success: true,
      from,
      to,
      quest: updatedQuest,
      errors: [],
    };
  }

  /** Update quest progress */
  async updateProgress(questId: string, increment: number = 1,): Promise<QuestRow> {
    const quest = await this.getQuest(questId,);
    if (!quest) { throw new Error("Quest not found",); }

    const newProgress = Math.min(quest.progress + increment, quest.target,);
    const now = new Date().toISOString();

    await this.db
      .updateTable("quests",)
      .set({
        progress: newProgress,
        updated_at: now,
        ...(newProgress >= quest.target
          ? {
            status: QuestStatus.Completed,
            completed_at: now,
          }
          : {}),
      },)
      .where("id", "=", questId,)
      .execute();

    return (await this.getQuest(questId,))!;
  }

  /** Get quest objectives from config */
  async getObjectives(questId: string,): Promise<QuestObjective[]> {
    const quest = await this.getQuest(questId,);
    if (!quest) { return []; }

    const config = parseJsonField<{ objectives?: QuestObjective[] }>(quest.config, {},);
    return config.objectives ?? [];
  }

  /** Update quest objectives */
  async updateObjective(
    questId: string,
    objectiveId: string,
    progress: number,
  ): Promise<QuestObjective[]> {
    const quest = await this.getQuest(questId,);
    if (!quest) { throw new Error("Quest not found",); }

    const config = parseJsonField<{ objectives?: QuestObjective[] }>(quest.config, {},);
    const objectives = config.objectives ?? [];

    const objective = objectives.find((o,) => o.id === objectiveId);
    if (!objective) { throw new Error("Objective not found",); }

    objective.current = Math.min(objective.current + progress, objective.count,);
    objective.completed = objective.current >= objective.count;

    await this.db
      .updateTable("quests",)
      .set({
        config: JSON.stringify({ ...config, objectives, },),
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", questId,)
      .execute();

    return objectives;
  }

  /** Get quest rewards */
  async getRewards(questId: string,): Promise<QuestReward[]> {
    const quest = await this.getQuest(questId,);
    if (!quest) { return []; }

    return parseJsonField<QuestReward[]>(quest.rewards, [],);
  }

  /** Claim a quest reward */
  async claimReward(questId: string, rewardIndex: number,): Promise<QuestReward> {
    const quest = await this.getQuest(questId,);
    if (!quest) { throw new Error("Quest not found",); }

    const rewards = parseJsonField<QuestReward[]>(quest.rewards, [],);
    if (rewardIndex < 0 || rewardIndex >= rewards.length) {
      throw new Error("Invalid reward index",);
    }

    const reward = rewards[rewardIndex];
    if (!reward) { throw new Error("Reward not found",); }
    if (reward.claimed) { throw new Error("Reward already claimed",); }

    reward.claimed = true;

    await this.db
      .updateTable("quests",)
      .set({
        rewards: JSON.stringify(rewards,),
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", questId,)
      .execute();

    return reward;
  }

  /** Check if quest can transition to a state */
  canTransition(from: QuestStatus, to: QuestStatus,): boolean {
    const allowed = QUEST_TRANSITIONS[from] ?? [];
    return allowed.includes(to,);
  }

  /** Get available transitions for a quest */
  async getAvailableTransitions(questId: string,): Promise<QuestStatus[]> {
    const quest = await this.getQuest(questId,);
    if (!quest) { return []; }

    const from = quest.status as QuestStatus;
    return QUEST_TRANSITIONS[from] ?? [];
  }
}
