// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service
 *
 * Orchestrates story progression by selecting actors, constructing
 * prompts, evaluating responses, and managing escalation.
 * Supports LLM, Human, and Hybrid Game Master modes.
 *
 * llmDecision() calls the generation module via injected generateText
 * callback — keeps story module decoupled from provider resolution.
 *
 * The heavy method bodies live in sibling dispatcher modules
 * (execute, accept, decisions, narration) threaded with an explicit
 * `GmState` handle. `GameMasterService` remains a class so its public
 * surface (and any methods kept on the prototype) is unchanged.
 */
import type { Kysely, } from "kysely";
import type { GmGuidance, } from "../../chat/types/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { QualityEvaluator, } from "../quality-evaluator";
import { createQualityEvaluator, } from "../quality-evaluator";
import { TurnManager, type TurnManagerOptions, } from "../turn-manager";
import type { GameMasterConfig, GameMasterDecision, QualityThresholds, } from "../types";
import { WorldStateService, } from "../world-state";
import { acceptResponse as acceptResponseDispatch, humanOverride as humanOverrideDispatch, } from "./accept";
import { executeTurn as executeTurnDispatch, } from "./execute";
import { injectNarration as injectNarrationDispatch, } from "./narration";
import type { GmState, GmTurnResult, } from "./types";

export type {
  BuildResultOptions,
  GenerateTextFn,
  GmState,
  GmTurnResult,
  StoryTurnRecord,
} from "./types";

// ── Game Master Service ─────────────────────────────────────

export class GameMasterService {
  private readonly db: Kysely<DB>;
  private readonly turnManager: TurnManager;
  private readonly worldState: WorldStateService;
  private readonly evaluator: QualityEvaluator;
  private readonly config: GameMasterConfig;
  private readonly appConfig: Config | undefined;
  private readonly gmGuidance: GmGuidance | undefined;
  private readonly chatId: string;
  private readonly generateText: GmState["generateText"];
  private readonly systemPromptDefault: string | undefined;

  /** Expose the dispatcher-facing state handle */
  private get state(): GmState {
    return {
      db: this.db,
      turnManager: this.turnManager,
      worldState: this.worldState,
      evaluator: this.evaluator,
      config: this.config,
      appConfig: this.appConfig,
      gmGuidance: this.gmGuidance,
      chatId: this.chatId,
      generateText: this.generateText,
      systemPromptDefault: this.systemPromptDefault,
    };
  }

  constructor(
    options: TurnManagerOptions & {
      generateText: GmState["generateText"];
      gmConfig: GameMasterConfig;
      qualityThresholds?: Partial<QualityThresholds>;
      /** Config-driven default GM system prompt (resolved from templates) */
      systemPromptDefault?: string;
      /** App-level config — enables config-driven prompt sections (e.g. NSFW policy). */
      appConfig?: Config;
      /** Human-GM narrative guidance steering turns (from chat gm_config). */
      gmGuidance?: GmGuidance;
    },
  ) {
    this.db = options.db;
    this.chatId = options.chatId;
    this.config = options.gmConfig;
    this.appConfig = options.appConfig;
    this.gmGuidance = options.gmGuidance;
    this.generateText = options.generateText;
    this.systemPromptDefault = options.systemPromptDefault;
    this.turnManager = new TurnManager({ db: options.db, chatId: options.chatId, },);
    this.worldState = new WorldStateService(options.db,);
    this.evaluator = createQualityEvaluator({
      thresholds: options.qualityThresholds as QualityThresholds | undefined,
    },);
  }

  /** Initialize the GM session */
  async initialize(): Promise<void> {
    await this.turnManager.initialize();
  }

  /** Get current turn manager state */
  get currentTurn(): number {
    return this.turnManager.currentTurn;
  }

  get isPaused(): boolean {
    return this.turnManager.isPaused;
  }

  get isComplete(): boolean {
    return this.turnManager.isComplete;
  }

  /** Execute one full story turn */
  async executeTurn(debugActorId?: string,): Promise<GmTurnResult> {
    return executeTurnDispatch(this.state, debugActorId,);
  }

  /** Accept a response and process it through the full pipeline */
  async acceptResponse(turnId: string, response: string,): Promise<GmTurnResult> {
    return acceptResponseDispatch(this.state, turnId, response,);
  }

  /** Human GM provides an override decision */
  async humanOverride(_chatId: string, turnId: string, decision: GameMasterDecision,): Promise<void> {
    return humanOverrideDispatch(this.state, _chatId, turnId, decision,);
  }

  /** Inject narration message into the story timeline */
  async injectNarration(worldId: string, text: string,): Promise<void> {
    return injectNarrationDispatch(this.state, worldId, text,);
  }

  /** Pause story generation */
  async pause(): Promise<void> {
    await this.turnManager.pause();
  }

  /** Resume story generation */
  async resume(): Promise<void> {
    await this.turnManager.resume();
  }
}
