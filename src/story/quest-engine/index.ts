/**
 * Quest Engine Service
 *
 * Manages the full lifecycle of world-level quests:
 * creation, progress tracking, milestone hook triggering,
 * completion detection, and reward distribution.
 *
 * Method bodies live in sibling dispatcher modules (progress, queries,
 * lifecycle) threaded with an explicit `QuestState` handle. The class
 * is kept so the constructor-based public surface is unchanged.
 */
import type { Kysely, } from "kysely";
import type { QuestType as QT, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { ItemsService, } from "../items";
import type { QuestConfig, QuestReward, WorldEvent, } from "../types";
import type { WorldStateService, } from "../world-state";
import {
  abandon as abandonDispatch,
  checkTimeQuests as checkTimeQuestsDispatch,
  createQuest as createQuestDispatch,
  fail as failDispatch,
} from "./lifecycle";
import {
  advanceProgress as advanceProgressDispatch,
  getCompletion as getCompletionDispatch,
  processEvent as processEventDispatch,
} from "./progress";
import { getActiveQuests as getActiveQuestsDispatch, getChatProgress as getChatProgressDispatch, } from "./queries";
import type { QuestProgressEntry, QuestState, } from "./types";

export type { QuestProgressEntry, } from "./types";

// ── Quest Engine Service ─────────────────────────────────────

export class QuestEngine {
  private readonly db: Kysely<DB>;
  private readonly worldState?: WorldStateService;
  private readonly items?: ItemsService;

  constructor(
    db: Kysely<DB>,
    worldState?: WorldStateService,
    items?: ItemsService,
  ) {
    this.db = db;
    this.worldState = worldState;
    this.items = items;
  }

  /** Expose the dispatcher-facing state handle */
  private get state(): QuestState {
    return { db: this.db, worldState: this.worldState, items: this.items, };
  }

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
  },): Promise<string> {
    return createQuestDispatch(this.state, params,);
  }

  /**
   * Process a world event and update matching quest progress.
   * Returns all quests that had their progress changed.
   */
  async processEvent(worldId: string, chatId: string, events: WorldEvent[],): Promise<QuestProgressEntry[]> {
    return processEventDispatch(this.state, worldId, chatId, events,);
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
    return advanceProgressDispatch(this.state, questId, chatId, delta, sourceMessageId,);
  }

  /** Get all active quests for a world */
  async getActiveQuests(worldId: string,) {
    return getActiveQuestsDispatch(this.state, worldId,);
  }

  /** Get quest progress for a specific chat */
  async getChatProgress(questId: string, chatId: string,) {
    return getChatProgressDispatch(this.state, questId, chatId,);
  }

  /** Fail a quest (e.g., deadline passed) */
  async fail(questId: string,): Promise<void> {
    return failDispatch(this.state, questId,);
  }

  /** Abandon a quest (GM action) */
  async abandon(questId: string,): Promise<void> {
    return abandonDispatch(this.state, questId,);
  }

  /** Get completion percentage for a quest */
  async getCompletion(questId: string,): Promise<{ progress: number; target: number; percentage: number }> {
    return getCompletionDispatch(this.state, questId,);
  }

  /** Check time-based quests for deadline expiry */
  async checkTimeQuests(worldId: string,): Promise<string[]> {
    return checkTimeQuestsDispatch(this.state, worldId,);
  }
}

export function createQuestEngine(
  db: Kysely<DB>,
  worldState?: WorldStateService,
  items?: ItemsService,
): QuestEngine {
  return new QuestEngine(db, worldState, items,);
}
