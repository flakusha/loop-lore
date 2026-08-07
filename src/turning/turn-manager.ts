/**
 * Turn Manager — Generalized Orchestration Engine
 *
 * Manages turn order, actor selection, pause/resume, and state persistence.
 * Works for both story mode (full GM orchestration) and group chat mode
 * (lightweight turn selection with talkativity weighting).
 *
 * Design: The TurnManager owns the turn state and selection logic.
 * It does NOT own prompt assembly or LLM calls — callers handle that
 * and pass results back via recordTurn().
 */
import type { Kysely, } from "kysely";
import { TurnStrategy, } from "../db/enums";
import type { TurnStrategy as TurnStrategyType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, safeJsonStringify, } from "../utils";
import { STRATEGY_MAP, } from "./turn-strategies";
import type { GroupTurnContext, TurnManagerState, TurnParticipant, } from "./types";

export interface TurnManagerOptions {
  db: Kysely<DB>;
  chatId: string;
  /** Quality thresholds for regeneration (story mode only) */
  maxRegenerations?: number;
}

export class TurnManager {
  private readonly db: Kysely<DB>;
  private readonly chatId: string;
  private readonly maxRegenerations: number;
  private state: TurnManagerState | null = null;

  constructor(options: TurnManagerOptions,) {
    this.db = options.db;
    this.chatId = options.chatId;
    this.maxRegenerations = options.maxRegenerations ?? 3;
  }

  // ─── State Management ─────────────────────────────────────────

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
    if (!this.state) { return; }
    const serialized = safeJsonStringify(this.state,);
    if (!serialized.ok) {
      getLogger()
        .child({ module: "turn-manager", },)
        .error("persistState serialization failed", undefined, { error: serialized.error, },);
      return;
    }
    await this.db
      .updateTable("chats",)
      .set({ story_state: serialized.value, },)
      .where("id", "=", this.chatId,)
      .execute();
  }

  // ─── Participant Fetching ─────────────────────────────────────

  /**
   * Fetch participants eligible for turn selection.
   *
   * @param mode - "story" filters to ai/narrator/npc; "group" includes all non-user agents
   */
  private async fetchTurnParticipants(mode: "story" | "group" = "story",): Promise<TurnParticipant[]> {
    const query = this.db
      .selectFrom("chat_participants",)
      .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
      .select([
        "chat_participants.actor_id",
        "actors.actor_type",
        "actors.agent_type",
        "chat_participants.talkativity",
      ],)
      .where("chat_participants.chat_id", "=", this.chatId,);

    const filtered = mode === "story"
      ? await query.where("actors.agent_type", "in", ["ai", "narrator", "npc",],).execute()
      : await query.where("actors.agent_type", "!=", "none",).execute();

    const participants: TurnParticipant[] = Array.from(filtered, (p,) => ({
      actorId: p.actor_id,
      type: p.actor_type,
      agentType: p.agent_type,
      talkativity: p.talkativity ?? 5,
    }),);

    // Inject initiative scores when using initiative strategy
    if (this.state?.strategy === TurnStrategy.Initiative) {
      const currentScene = "main"; // TODO: detect actual current scene from story_state
      const initiatives = await this.db
        .selectFrom("group_initiatives",)
        .select(["actor_id", "score",],)
        .where("chat_id", "=", this.chatId,)
        .where("scene_id", "=", currentScene,)
        .execute();

      const initiativeMap = new Map(Array.from(initiatives, (i,) => [i.actor_id, i.score,],),);
      for (const p of participants) {
        const score = initiativeMap.get(p.actorId,);
        if (score != null) {
          p.initiativeScore = score;
        }
      }
    }

    return participants;
  }

  private async refreshTurnOrder(mode: "story" | "group" = "story",): Promise<void> {
    if (!this.state) { return; }
    const participants = await this.fetchTurnParticipants(mode,);
    const typeOrder: Record<string, number> = { narrator: 0, ai: 1, npc: 2, };
    participants.sort((a, b,) => {
      const aOrder = typeOrder[a.agentType] ?? 99;
      const bOrder = typeOrder[b.agentType] ?? 99;
      return aOrder - bOrder;
    },);
    this.state.turnOrder = Array.from(participants, (p,) => p.actorId,);
  }

  // ─── Initialization ───────────────────────────────────────────

  /** Load or initialize turn manager state from the DB */
  async initialize(): Promise<void> {
    const chat = await this.db
      .selectFrom("chats",)
      .select(["story_state", "turn_strategy", "max_turns",],)
      .where("id", "=", this.chatId,)
      .executeTakeFirst();

    if (!chat) {
      throw new Error(`Chat ${this.chatId} not found`,);
    }

    this.state = chat.story_state
      ? jsonParseOr(chat.story_state, this.createInitialState(),)
      : this.createInitialState();

    if (chat.turn_strategy) {
      this.state.strategy = chat.turn_strategy;
    }

    if (chat.max_turns != null) {
      this.state.maxTurns = chat.max_turns;
    }

    if (this.state.turnOrder.length === 0) {
      await this.refreshTurnOrder();
    }
  }

  // ─── Public API ───────────────────────────────────────────────

  get currentTurn(): number {
    return this.state?.currentTurn ?? 0;
  }

  get stateSnapshot(): TurnManagerState | null {
    return this.state;
  }

  get isPaused(): boolean {
    return this.state?.isPaused ?? true;
  }

  get isComplete(): boolean {
    if (!this.state) { return false; }
    const maxTurns = this.state.maxTurns ?? Number.MAX_SAFE_INTEGER;
    if (maxTurns <= 0) { return false; }
    return this.state.currentTurn >= maxTurns;
  }

  /**
   * Select the next actor to act.
   *
   * @param strategy - Override strategy (default: state.strategy)
   * @param context - Turn context (@mentions, recent actors, chat mode, or story context)
   * @returns Selected actor ID, or null if no participants
   */
  async selectNextActor(
    strategy?: TurnStrategyType,
    context?: GroupTurnContext | Record<string, unknown>,
  ): Promise<string | null> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }

    const resolvedStrategy = strategy ?? this.state.strategy;
    const mode = context?.chatMode === "group" ? "group" : "story";
    const participants = await this.fetchTurnParticipants(mode,);

    if (participants.length === 0) { return null; }

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

  /** Record a completed turn (persists state) */
  async recordTurn(): Promise<void> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }
    this.state.lastTurnCompletedAt = new Date().toISOString();
    // Initiative strategy: spending a turn consumes one initiative point, so an
    // actor can't dominate every turn (docs/frontend/chat/group-chat.md Step 2).
    if (this.state.strategy === TurnStrategy.Initiative && this.state.currentActorId) {
      await this.decrementInitiative(this.state.currentActorId,);
    }
    await this.persistState();
  }

  /** Decrement the active actor's initiative score for the current scene (min 0). */
  private async decrementInitiative(actorId: string,): Promise<void> {
    const currentScene = "main"; // TODO: detect actual current scene from story_state
    const current = await this.db
      .selectFrom("group_initiatives",)
      .select("score",)
      .where("chat_id", "=", this.chatId,)
      .where("scene_id", "=", currentScene,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    const nextScore = Math.max(0, (current?.score ?? 1) - 1,);
    if (current) {
      await this.db
        .updateTable("group_initiatives",)
        .set({ score: nextScore, updated_at: new Date().toISOString(), },)
        .where("chat_id", "=", this.chatId,)
        .where("scene_id", "=", currentScene,)
        .where("actor_id", "=", actorId,)
        .execute();
    } else {
      // No row yet (default 1) — create with the decremented value so future
      // selections see a floor of 0 instead of the default.
      await this.db
        .insertInto("group_initiatives",)
        .values({
          chat_id: this.chatId,
          scene_id: currentScene,
          actor_id: actorId,
          score: 0,
        },)
        .onConflict((oc,) => oc.columns(["chat_id", "scene_id", "actor_id",],).doNothing())
        .execute();
    }
  }

  /** Request regeneration of a failed turn */
  async requestRegeneration(turnId: string, reason: string,): Promise<boolean> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }

    const currentAttempt = this.state.pendingRegeneration?.attempt ?? 0;
    if (currentAttempt >= this.maxRegenerations) { return false; }

    this.state.pendingRegeneration = { turnId, attempt: currentAttempt + 1, reason, };
    await this.persistState();
    return true;
  }

  /** Clear pending regeneration (accepted) */
  async clearRegeneration(): Promise<void> {
    if (!this.state) { return; }
    this.state.pendingRegeneration = null;
    await this.persistState();
  }

  /** Pause turn generation */
  async pause(): Promise<void> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }
    this.state.isPaused = true;
    await this.persistState();
  }

  /** Resume turn generation */
  async resume(): Promise<void> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }
    this.state.isPaused = false;
    await this.persistState();
  }

  /** Reset turn counter (e.g., new scene) */
  async resetTurnCounter(): Promise<void> {
    if (!this.state) { throw new Error("TurnManager not initialized",); }
    this.state.currentTurn = 0;
    this.state.currentActorId = null;
    await this.persistState();
  }

  /** Update turn order (e.g., participant added/removed) */
  async refreshOrder(mode: "story" | "group" = "story",): Promise<void> {
    await this.refreshTurnOrder(mode,);
  }
}
