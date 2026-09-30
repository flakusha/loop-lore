// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 *
 * The method bodies live in sibling dispatcher modules (state / participants /
 * selection / lifecycle) threaded with an explicit `TurnManagerHost` handle.
 * `TurnManager` remains a class so callers can `new TurnManager({...})`.
 */
import type { Kysely, } from "kysely";
import type { TurnStrategy as TurnStrategyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { GroupTurnContext, TurnManagerState, } from "../types";
import {
  clearRegeneration as clearRegenerationDispatch,
  pause as pauseDispatch,
  requestRegeneration as requestRegenerationDispatch,
  resetTurnCounter as resetTurnCounterDispatch,
  resume as resumeDispatch,
} from "./lifecycle";
import { refreshOrderPublic, } from "./participants";
import { recordTurn as recordTurnDispatch, selectNextActor as selectNextActorDispatch, } from "./selection";
import { initializeTurnManager, } from "./state";
import type { TurnManagerOptions, } from "./types";

export type { TurnManagerOptions, } from "./types";

/** */
export class TurnManager {
  db: Kysely<DB>;
  chatId: string;
  maxRegenerations: number;
  state: TurnManagerState | null = null;

  /**
   * @param options
   */
  constructor(options: TurnManagerOptions,) {
    this.db = options.db;
    this.chatId = options.chatId;
    this.maxRegenerations = options.maxRegenerations ?? 3;
  }

  // ─── Initialization ───────────────────────────────────────────

  /** Load or initialize turn manager state from the DB */
  /**
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    return initializeTurnManager(this,);
  }

  // ─── Public API ───────────────────────────────────────────────

  /** */
  get currentTurn(): number {
    return this.state?.currentTurn ?? 0;
  }

  /** */
  get stateSnapshot(): TurnManagerState | null {
    return this.state;
  }

  /** */
  get isPaused(): boolean {
    return this.state?.isPaused ?? true;
  }

  /** */
  get isComplete(): boolean {
    if (!this.state) { return false; }
    const maxTurns = this.state.maxTurns ?? Number.MAX_SAFE_INTEGER;
    if (maxTurns <= 0) { return false; }
    return this.state.currentTurn >= maxTurns;
  }

  /**
   * Select the next actor to act.
   * @param strategy - Override strategy (default: state.strategy)
   * @param context - Turn context (@mentions, recent actors, chat mode, or story context)
   * @returns Selected actor ID, or null if no participants
   */
  /**
   * @param {TurnStrategyType} strategy
   * @param {GroupTurnContext | Record<string, unknown>} context
   * @returns {Promise<string | null>}
   */
  async selectNextActor(
    strategy?: TurnStrategyType,
    context?: GroupTurnContext | Record<string, unknown>,
  ): Promise<string | null> {
    return selectNextActorDispatch(this, strategy, context,);
  }

  /** Record a completed turn (persists state) */
  /**
   * @returns {Promise<void>}
   */
  async recordTurn(): Promise<void> {
    return recordTurnDispatch(this,);
  }

  /**
   * Request regeneration of a failed turn
   * @param turnId
   * @param reason
   */
  /**
   * @param {string} turnId
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async requestRegeneration(turnId: string, reason: string,): Promise<boolean> {
    return requestRegenerationDispatch(this, turnId, reason,);
  }

  /** Clear pending regeneration (accepted) */
  /**
   * @returns {Promise<void>}
   */
  async clearRegeneration(): Promise<void> {
    return clearRegenerationDispatch(this,);
  }

  /** Pause turn generation */
  /**
   * @returns {Promise<void>}
   */
  async pause(): Promise<void> {
    return pauseDispatch(this,);
  }

  /** Resume turn generation */
  /**
   * @returns {Promise<void>}
   */
  async resume(): Promise<void> {
    return resumeDispatch(this,);
  }

  /** Reset turn counter (e.g., new scene) */
  /**
   * @returns {Promise<void>}
   */
  async resetTurnCounter(): Promise<void> {
    return resetTurnCounterDispatch(this,);
  }

  /**
   * Update turn order (e.g., participant added/removed)
   * @param mode
   */
  /**
   * @param {"story" | "group"} mode
   * @returns {Promise<void>}
   */
  async refreshOrder(mode: "story" | "group" = "story",): Promise<void> {
    return refreshOrderPublic(this, mode,);
  }
}
