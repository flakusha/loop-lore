/**
 * Quest Engine Service
 *
 * Manages the full lifecycle of world-level quests:
 * creation, progress tracking, milestone hook triggering,
 * completion detection, and reward distribution.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { QuestType, QuestStatus, QuestProgressStatus } from "../db/enums";
import type { QuestType as QT } from "../db/enums";
import { randomUUID } from "node:crypto";
import type { QuestConfig, QuestReward, WorldEvent } from "./types";
import { WorldStateService } from "./world-state";
import { ItemsService } from "./items";
import { applyEvents } from "./events";

// ── Progress Entry ───────────────────────────────────────────

export interface QuestProgressEntry {
  questId: string;
  questName: string;
  questType: QT;
  previousProgress: number;
  newProgress: number;
  target: number;
  delta: number;
  milestoneHit: string | null;
  completed: boolean;
}

// ── Quest Engine Service ─────────────────────────────────────

export class QuestEngine {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly worldState?: WorldStateService,
    private readonly items?: ItemsService,
  ) {}

  /** Create a new quest */
  async createQuest(params: {
    worldId: string;
    creatorId: string;
    name: string;
    description: string | null;
    type: QT;
    config: QuestConfig;
    target: number;
    priority?: number;
    deadline?: string;
    rewards?: QuestReward;
    narrativeHooks?: { progress: number; narrative: string }[];
  }): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto("quests")
      .values({
        id,
        world_id: params.worldId,
        creator_id: params.creatorId,
        name: params.name,
        description: params.description,
        type: params.type,
        status: QuestStatus.Active,
        priority: params.priority ?? 0,
        config: JSON.stringify(params.config),
        progress: 0,
        target: params.target,
        start_time: new Date().toISOString(),
        deadline: params.deadline ?? null,
        rewards: JSON.stringify(params.rewards ?? {}),
        narrative_hooks: JSON.stringify(params.narrativeHooks ?? []),
      })
      .execute();
    return id;
  }

  /**
   * Process a world event and update matching quest progress.
   * Returns all quests that had their progress changed.
   */
  async processEvent(worldId: string, chatId: string, events: WorldEvent[]): Promise<QuestProgressEntry[]> {
    const activeQuests = await this.db
      .selectFrom("quests")
      .selectAll()
      .where("world_id", "=", worldId)
      .where("status", "=", QuestStatus.Active)
      .execute();

    const results: QuestProgressEntry[] = [];

    for (const quest of activeQuests) {
      for (const event of events) {
        const delta = this.calculateProgress(quest, event);
        if (delta > 0) {
          results.push(await this.applyProgress(quest, chatId, delta));
        }
      }
    }

    return results;
  }

  /**
   * Manually update quest progress for a specific chat.
   */
  async advanceProgress(
    questId: string,
    chatId: string,
    delta: number,
    sourceMessageId?: string,
  ): Promise<QuestProgressEntry> {
    const quest = await this.db.selectFrom("quests").selectAll().where("id", "=", questId).executeTakeFirst();

    if (!quest) throw new Error(`Quest ${questId} not found`);

    return this.applyProgress(quest, chatId, delta, sourceMessageId);
  }

  /** Get all active quests for a world */
  async getActiveQuests(worldId: string) {
    return this.db
      .selectFrom("quests")
      .selectAll()
      .where("world_id", "=", worldId)
      .where("status", "=", QuestStatus.Active)
      .orderBy("priority", "desc")
      .execute();
  }

  /** Get quest progress for a specific chat */
  async getChatProgress(questId: string, chatId: string) {
    return this.db
      .selectFrom("quest_progress")
      .selectAll()
      .where("quest_id", "=", questId)
      .where("chat_id", "=", chatId)
      .executeTakeFirst();
  }

  /** Fail a quest (e.g., deadline passed) */
  async fail(questId: string): Promise<void> {
    await this.db
      .updateTable("quests")
      .set({ status: QuestStatus.Failed })
      .where("id", "=", questId)
      .execute();

    await this.db
      .updateTable("quest_progress")
      .set({ status: QuestProgressStatus.Failed })
      .where("quest_id", "=", questId)
      .execute();
  }

  /** Abandon a quest (GM action) */
  async abandon(questId: string): Promise<void> {
    await this.db
      .updateTable("quests")
      .set({ status: QuestStatus.Abandoned })
      .where("id", "=", questId)
      .execute();

    await this.db
      .updateTable("quest_progress")
      .set({ status: QuestProgressStatus.Ignored })
      .where("quest_id", "=", questId)
      .execute();
  }

  /** Get completion percentage for a quest */
  async getCompletion(questId: string): Promise<{ progress: number; target: number; percentage: number }> {
    const quest = await this.db
      .selectFrom("quests")
      .select(["progress", "target"])
      .where("id", "=", questId)
      .executeTakeFirst();

    if (!quest) throw new Error(`Quest ${questId} not found`);

    return {
      progress: quest.progress,
      target: quest.target,
      percentage: quest.target > 0 ? Math.round((quest.progress / quest.target) * 100) : 0,
    };
  }

  /** Check time-based quests for deadline expiry */
  async checkTimeQuests(worldId: string): Promise<string[]> {
    const now = new Date().toISOString();
    const timeQuests = await this.db
      .selectFrom("quests")
      .select(["id", "type", "deadline", "config"])
      .where("world_id", "=", worldId)
      .where("status", "=", QuestStatus.Active)
      .where("type", "=", QuestType.Time)
      .execute();

    const expired: string[] = [];

    for (const quest of timeQuests) {
      if (quest.deadline && quest.deadline < now) {
        await this.fail(quest.id);
        expired.push(quest.id);
      }
    }

    return expired;
  }

  // ── Private ─────────────────────────────────────────────────

  /**
   * Calculate progress delta for a quest based on a world event.
   * Returns 0 if the event doesn't advance this quest.
   */
  private calculateProgress(
    quest: {
      id: string;
      type: string;
      config: string;
      progress: number;
      target: number;
      name: string;
      narrative_hooks: string;
      rewards: string;
    },
    event: WorldEvent,
  ): number {
    const config = JSON.parse(quest.config) as QuestConfig;
    const questType = quest.type as QT;

    switch (questType) {
      case QuestType.Destruction: {
        if (event.type !== "combat_event") return 0;
        const defeated = event.data.defeated as boolean;
        if (!defeated) return 0;
        const cfg = config as import("./types").DestructionQuestConfig;
        if (cfg.targetActorId) {
          return event.data.defenderId === cfg.targetActorId ? 1 : 0;
        }
        return cfg.targetQuantity ? Math.round(100 / cfg.targetQuantity) : 10;
      }

      case QuestType.Collection: {
        if (event.type !== "item_transfer") return 0;
        const cfg = config as import("./types").CollectionQuestConfig;
        const itemName = (event.data.itemName as string | undefined)?.toLowerCase();
        if (cfg.items) {
          let totalQuantity = 0;
          let hasMatch = false;
          for (const i of cfg.items) {
            totalQuantity += i.quantity;
            if (itemName?.includes(i.itemId.toLowerCase())) hasMatch = true;
          }
          return hasMatch ? Math.round(100 / totalQuantity) : 0;
        }
        return cfg.categoryQuantity ? Math.round(100 / cfg.categoryQuantity) : 10;
      }

      case QuestType.Rescue: {
        if (event.type !== "location_change") return 0;
        const cfg = config as import("./types").RescueQuestConfig;
        if (event.actorId === cfg.targetActorId && event.locationId === cfg.safeLocationId) {
          return 100 - quest.progress; // Complete
        }
        return 0;
      }

      case QuestType.Time: {
        if (event.type !== "time_advancement") return 0;
        const cfg = config as import("./types").TimeQuestConfig;
        const minutes = (event.data.minutesAdvanced ?? 60) as number;
        const advance = Math.round((minutes / cfg.durationMinutes) * 100);
        return advance;
      }

      case QuestType.Discovery: {
        if (event.type !== "location_change") return 0;
        const cfg = config as import("./types").DiscoveryQuestConfig;
        if (event.locationId === cfg.targetLocationId) {
          return 100 - quest.progress; // Complete
        }
        // Check if any clue location was visited
        const clueHit = cfg.clues.find((c) => c.locationId === event.locationId);
        if (clueHit) return Math.round(100 / (cfg.clues.length + 1));
        return 0;
      }

      case QuestType.Social: {
        if (event.type !== "npc_state_change") return 0;
        const cfg = config as import("./types").SocialQuestConfig;
        const npcId = (event.data.npcActorId ?? event.actorId) as string;
        if (npcId === cfg.targetActorId) {
          return Math.round(100 / cfg.requiredInteractions);
        }
        return 0;
      }

      case QuestType.Composite: {
        // Composite quests are handled by checking sub-quest completions
        return 0;
      }

      default:
        return 0;
    }
  }

  /**
   * Apply progress to a quest, check milestones, and distribute rewards
   * if completed.
   */
  private async applyProgress(
    quest: {
      id: string;
      world_id: string;
      progress: number;
      target: number;
      name: string;
      narrative_hooks: string;
      rewards: string;
      type: string;
    },
    chatId: string,
    delta: number,
    sourceMessageId?: string,
  ): Promise<QuestProgressEntry> {
    const newProgress = Math.min(quest.progress + delta, quest.target);
    const completed = newProgress >= quest.target;

    // Update global quest progress
    await this.db
      .updateTable("quests")
      .set({
        progress: newProgress,
        ...(completed ? { status: QuestStatus.Completed, completed_at: new Date().toISOString() } : {}),
      })
      .where("id", "=", quest.id)
      .execute();

    // Update or insert per-chat progress
    const existingChatProgress = await this.db
      .selectFrom("quest_progress")
      .select("id")
      .where("quest_id", "=", quest.id)
      .where("chat_id", "=", chatId)
      .executeTakeFirst();

    if (existingChatProgress) {
      await this.db
        .updateTable("quest_progress")
        .set({
          progress: newProgress,
          status: completed ? QuestProgressStatus.Completed : QuestProgressStatus.Active,
          updated_at: new Date().toISOString(),
          completed_at: completed ? new Date().toISOString() : undefined,
        })
        .where("id", "=", existingChatProgress.id)
        .execute();
    } else {
      await this.db
        .insertInto("quest_progress")
        .values({
          id: randomUUID() as string,
          quest_id: quest.id,
          chat_id: chatId,
          progress: newProgress,
          status: completed ? QuestProgressStatus.Completed : QuestProgressStatus.Active,
          contributed_events: sourceMessageId ? JSON.stringify([sourceMessageId]) : "[]",
          completed_at: completed ? new Date().toISOString() : null,
        })
        .execute();
    }

    // Check milestones
    const hooks = JSON.parse(quest.narrative_hooks) as { progress: number; narrative: string }[];
    let oldMilestone: { progress: number; narrative: string } | undefined;
    let newMilestone: { progress: number; narrative: string } | undefined;
    for (const h of hooks) {
      if (h.progress <= quest.progress) {
        if (!oldMilestone || h.progress > oldMilestone.progress) oldMilestone = h;
      }
      if (h.progress <= newProgress && h.progress > quest.progress) {
        if (!newMilestone || h.progress > newMilestone.progress) newMilestone = h;
      }
    }

    let milestoneText: string | null = null;
    if (newMilestone && (!oldMilestone || oldMilestone.progress < newMilestone.progress)) {
      milestoneText = newMilestone.narrative;
      // Inject narration milestone
      if (this.worldState) {
        await this.worldState.snapshot(
          quest.world_id,
          undefined,
          undefined,
          `Quest milestone: ${quest.name} - ${milestoneText}`,
        );
      }
    }

    // Distribute rewards on completion
    if (completed) {
      await this.distributeRewards(quest.id, quest.world_id, quest.rewards);
    }

    return {
      questId: quest.id,
      questName: quest.name,
      questType: quest.type as QT,
      previousProgress: quest.progress,
      newProgress,
      target: quest.target,
      delta,
      milestoneHit: milestoneText,
      completed,
    };
  }

  /**
   * Distribute quest rewards on completion.
   */
  private async distributeRewards(questId: string, worldId: string, rewardsJson: string): Promise<void> {
    const rewards = JSON.parse(rewardsJson) as QuestReward;
    if (Object.keys(rewards).length === 0) return;

    // Apply world changes (lore updates, location changes)
    if (rewards.worldChanges && rewards.worldChanges.length > 0 && this.items) {
      await applyEvents(this.db, worldId, rewards.worldChanges);
    }

    // Unlock follow-up quests
    if (rewards.unlockQuests && rewards.unlockQuests.length > 0) {
      for (const subQuestId of rewards.unlockQuests) {
        await this.db
          .updateTable("quests")
          .set({ status: QuestStatus.Active })
          .where("id", "=", subQuestId)
          .where("status", "=", QuestStatus.Abandoned)
          .execute();
      }
    }

    // Create items (if ItemsService is available)
    if (rewards.items && this.items) {
      for (const item of rewards.items) {
        for (let i = 0; i < item.quantity; i++) {
          await this.items.createDefinition({
            worldId,
            name: item.itemId,
            description: `Reward from quest ${questId}`,
            category: "quest_item",
            rarity: "uncommon",
            stackable: true,
            maxStack: 99,
            properties: {},
            value: 0,
            weight: 0.1,
          });
        }
      }
    }
  }
}
