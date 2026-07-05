/**
 * Turn Manager
 *
 * Core orchestration engine for multi-LLM story generation.
 * Manages turn order, actor selection, prompt construction,
 * regeneration cycles, and coordinates with the Game Master.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { TurnStrategy } from "../db/enums";
import type { TurnStrategy as TurnStrategyType } from "../db/enums";
import type {
  TurnManagerState,
  QualityEvaluation,
  QualityThresholds,
  GameMasterConfig,
  StoryContext,
  WorldEvent,
} from "./types";
import { DEFAULT_QUALITY_THRESHOLDS } from "./types";
import { STRATEGY_MAP, type TurnParticipant } from "./turn-strategies";
import { jsonParseOr, safeJsonStringify } from "../utils";

export interface TurnManagerOptions {
  db: Kysely<DB>;
  chatId: string;
  gmConfig: GameMasterConfig;
  qualityThresholds?: Partial<QualityThresholds>;
}

export class TurnManager {
  private readonly db: Kysely<DB>;
  private readonly chatId: string;
  private readonly gmConfig: GameMasterConfig;
  private readonly qualityThresholds: QualityThresholds;
  private state: TurnManagerState | null = null;

   
  // ─── Private Helpers ────────────────────────────────────────────

  private createInitialState(): TurnManagerState {
    return {
      currentTurn: 0,
      currentActorId: null,
      turnOrder: [],
      strategy: TurnStrategy.Hybrid,
      isPaused: false,
      lastTurnCompletedAt: null,
      pendingRegeneration: null,
    };
  }

  private async persistState(): Promise<void> {
    if (!this.state) return;
    const serialized = safeJsonStringify(this.state);
    if (!serialized.ok) { console.error("[turn-manager] persistState serialization failed:", serialized.error); return; }
    await this.db
      .updateTable("chats")
      .set({ story_state: serialized.value })
      .where("id", "=", this.chatId)
      .execute();
  }

  private async fetchTurnParticipants(): Promise<TurnParticipant[]> {
    const participants = await this.db
      .selectFrom("chat_participants")
      .innerJoin("actors", "actors.id", "chat_participants.actor_id")
      .select(["chat_participants.actor_id", "actors.actor_type", "actors.agent_type"])
      .where("chat_participants.chat_id", "=", this.chatId)
      .where("actors.agent_type", "in", ["ai", "narrator", "npc"])
      .execute();

    return participants.map((p) => ({
      actorId: p.actor_id,
      type: p.actor_type,
      agentType: p.agent_type,
    }));
  }

  private async refreshTurnOrder(): Promise<void> {
    if (!this.state) return;

    const participants = await this.fetchTurnParticipants();

    const typeOrder: Record<string, number> = { narrator: 0, ai: 1, npc: 2 };
    participants.sort((a, b) => {
      const aOrder = typeOrder[a.agentType] ?? 99;
      const bOrder = typeOrder[b.agentType] ?? 99;
      return aOrder - bOrder;
    });

    this.state.turnOrder = participants.map((p) => p.actorId);
  }

  private async getTurnOrderActors(): Promise<TurnParticipant[]> {
    if (!this.state) return [];
    return this.fetchTurnParticipants();
  }

  constructor(options: TurnManagerOptions) {
    this.db = options.db;
    this.chatId = options.chatId;
    this.gmConfig = options.gmConfig;
    this.qualityThresholds = {
      ...DEFAULT_QUALITY_THRESHOLDS,
      ...options.qualityThresholds,
    };
  }

  /** Load or initialize turn manager state from the DB */
  async initialize(): Promise<void> {
    const chat = await this.db
      .selectFrom("chats")
      .select(["story_state", "turn_strategy", "max_turns", "auto_advance"])
      .where("id", "=", this.chatId)
      .executeTakeFirst();

    if (!chat) {
      throw new Error(`Chat ${this.chatId} not found`);
    }

    this.state = chat.story_state ? jsonParseOr(chat.story_state, this.createInitialState()) : this.createInitialState();

    // Store maxTurns from chat config (overrides persisted state)
    if (chat.max_turns != null) {
      this.state.maxTurns = chat.max_turns;
    }

    if (this.state.turnOrder.length === 0) {
      await this.refreshTurnOrder();
    }
  }

  /** Get current turn number */
  get currentTurn(): number {
    return this.state?.currentTurn ?? 0;
  }

  /** Get current state */
  get stateSnapshot(): TurnManagerState | null {
    return this.state;
  }

  /** Select the next actor to act based on the turn strategy */
  async selectNextActor(strategy?: TurnStrategyType, context?: StoryContext): Promise<string | null> {
    if (!this.state) throw new Error("TurnManager not initialized");

    const resolvedStrategy = strategy ?? this.state.strategy;
    const participants = await this.getTurnOrderActors();

    if (participants.length === 0) return null;

    this.state.currentTurn++;

    const selectFn = STRATEGY_MAP[resolvedStrategy];
    const selectedId = selectFn(
      participants,
      this.state.currentActorId,
      this.state.currentTurn,
      this.state.turnOrder,
      context,
    );
    this.state.currentActorId = selectedId;
    return selectedId;
  }

  /** Record a completed turn */
  async recordTurn(_params: {
    turnId: string;
    actorId: string;
    prompt: string;
    response: string;
    qualityEvaluation: QualityEvaluation;
    worldEvents: WorldEvent[];
    questUpdates: { questId: string; progressDelta: number; milestoneHit: boolean }[];
  }): Promise<void> {
    if (!this.state) throw new Error("TurnManager not initialized");

    this.state.lastTurnCompletedAt = new Date().toISOString();
    await this.persistState();
  }

  /** Request regeneration of a failed turn */
  async requestRegeneration(turnId: string, reason: string): Promise<boolean> {
    if (!this.state) throw new Error("TurnManager not initialized");

    const currentAttempt = this.state.pendingRegeneration?.attempt ?? 0;

    if (currentAttempt >= this.qualityThresholds.maxRegenerations) {
      return false;
    }

    this.state.pendingRegeneration = {
      turnId,
      attempt: currentAttempt + 1,
      reason,
    };

    await this.persistState();
    return true;
  }

  /** Clear pending regeneration (accepted) */
  async clearRegeneration(): Promise<void> {
    if (!this.state) return;
    this.state.pendingRegeneration = null;
    await this.persistState();
  }

  /** Pause story generation */
  async pause(): Promise<void> {
    if (!this.state) throw new Error("TurnManager not initialized");
    this.state.isPaused = true;
    await this.persistState();
  }

  /** Resume story generation */
  async resume(): Promise<void> {
    if (!this.state) throw new Error("TurnManager not initialized");
    this.state.isPaused = false;
    await this.persistState();
  }

  /** Get whether generation is paused */
  get isPaused(): boolean {
    return this.state?.isPaused ?? true;
  }

  /** Check if story session has reached max turns */
  // TODO: default maxTurns=MAX_SAFE_INTEGER effectively disables turn limit. Ensure chat.max_turns is configured.
  get isComplete(): boolean {
    if (!this.state) return false;
    const maxTurns = this.state.maxTurns ?? Number.MAX_SAFE_INTEGER;
    // Guard: maxTurns <= 0 treated as unlimited (same as MAX_SAFE_INTEGER default)
    if (maxTurns <= 0) return false;
    return this.state.currentTurn >= maxTurns;
  }
}
