/**
 * Game Master Service
 *
 * Orchestrates story progression by selecting actors, constructing
 * prompts, evaluating responses, and managing escalation.
 * Supports LLM, Human, and Hybrid Game Master modes.
 *
 * llmDecision() calls the generation module via injected generateText
 * callback — keeps story module decoupled from provider resolution.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import {
  GameMasterType,
  ContentEncoding,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  MessageStatus,
  MessageVisibility,
} from "../db/enums";
import { randomUUID } from "node:crypto";
import { safeJsonStringify, jsonParseOr } from "../utils";
import { TurnManager, type TurnManagerOptions } from "./turn-manager";
import { WorldStateService } from "./world-state";
import { QualityEvaluator, createQualityEvaluator } from "./quality-evaluator";
import { extractEvents, validateEvents, applyEvents } from "./events";
import type {
  GameMasterConfig,
  GameMasterDecision,
  StoryContext,
  QualityEvaluation,
  QualityThresholds,
  WorldEvent,
} from "./types";
import { GM_DECISIONS } from "./gm/decisions/registry";
import type { GenerateTextFn } from "./gm/decisions/types";

// ── LLM call abstraction ─────────────────────────────────

/**
 * Function provided by the caller to actually invoke an LLM.
 * Keeps GameMasterService independent of provider resolution.
 */
export type { GenerateTextFn } from "./gm/decisions/types";

// ── Story turn row type (from DB) ──────────────────────────

export interface StoryTurnRecord {
  id: string;
  turn_number: number;
  actor_id: string;
  prompt_sent: string;
  chat_id: string;
  turn_type: string;
  status: string;
  regeneration_count: number;
  world_events: string;
  quest_progress: string;
  completed_at: string | null;
  started_at: string;
  created_at: string;
  updated_at: string;
  response_received: string | null;
  quality_score: number | null;
  quality_details: string | null;
  gm_decision: string | null;
}

export interface BuildResultOptions {
  turn: StoryTurnRecord;
  response: string;
  qualityEval: QualityEvaluation;
  worldEvents: WorldEvent[];
  accepted: boolean;
  escalated: boolean;
  regenerationSuggested: boolean;
}

// ── GM Decision Result ──────────────────────────────────────

export interface GmTurnResult {
  turnId: string;
  turnNumber: number;
  actorId: string;
  prompt: string;
  response: string | null;
  qualityEvaluation: QualityEvaluation | null;
  worldEvents: WorldEvent[];
  gmDecision: GameMasterDecision | null;
  accepted: boolean;
  escalated: boolean;
  regenerationSuggested: boolean;
  narration: string | null;
}

// ── Game Master Service ─────────────────────────────────────

export class GameMasterService {
  private readonly db: Kysely<DB>;
  private readonly turnManager: TurnManager;
  private readonly worldState: WorldStateService;
  private readonly evaluator: QualityEvaluator;
  private readonly config: GameMasterConfig;
  private readonly chatId: string;
  private readonly generateText: GenerateTextFn;

  // ── Private Methods ────────────────────────────────────────────

  private getChatIdFromConfig(): string {
    return this.chatId;
  }

  private async getGmDecision(context: StoryContext, debugActorId?: string): Promise<GameMasterDecision> {
    const turnContext = {
      chatMode: "story" as const,
      isPaused: this.turnManager.isPaused,
    };
    const actorId = debugActorId ?? (await this.turnManager.selectNextActor(undefined, turnContext));

    if (!actorId) {
      throw new Error("No available actors for next turn");
    }

    const strategy = GM_DECISIONS[this.config.type] ?? GM_DECISIONS[GameMasterType.Llm];
    return strategy(
      { config: this.config, generateText: this.generateText, db: this.db, chatId: this.chatId },
      context,
      actorId,
    );
  }

  private async recordGmTurn(
    _context: StoryContext,
    turnId: string,
    turnNumber: number,
    decision: GameMasterDecision,
  ): Promise<void> {
    await this.db
      .insertInto("story_turns")
      .values({
        id: turnId,
        chat_id: this.getChatIdFromConfig() || "pending",
        turn_number: turnNumber,
        actor_id: decision.nextActorId,
        turn_type: "character_action",
        prompt_sent: decision.turnPrompt,
        status: "pending",
        regeneration_count: 0,
        world_events: "[]",
        quest_progress: "[]",
        gm_decision: (() => {
          const r = safeJsonStringify(decision);
          return r.ok ? r.value : "{}";
        })(),
      })
      .execute();
  }

  private buildResult(options: BuildResultOptions): GmTurnResult {
    const { turn, response, qualityEval, worldEvents, accepted, escalated, regenerationSuggested } = options;
    return {
      turnId: turn.id,
      turnNumber: turn.turn_number,
      actorId: turn.actor_id,
      prompt: turn.prompt_sent,
      response,
      qualityEvaluation: qualityEval,
      worldEvents,
      gmDecision: turn.gm_decision ? jsonParseOr(turn.gm_decision, null) : null,
      accepted,
      escalated,
      regenerationSuggested,
      narration: null,
    };
  }

  constructor(
    options: TurnManagerOptions & {
      generateText: GenerateTextFn;
      gmConfig: GameMasterConfig;
      qualityThresholds?: Partial<QualityThresholds>;
    },
  ) {
    this.db = options.db;
    this.chatId = options.chatId;
    this.config = options.gmConfig;
    this.generateText = options.generateText;
    this.turnManager = new TurnManager({ db: options.db, chatId: options.chatId });
    this.worldState = new WorldStateService(options.db);
    this.evaluator = createQualityEvaluator({
      thresholds: options.qualityThresholds as QualityThresholds | undefined,
    });
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
  async executeTurn(debugActorId?: string): Promise<GmTurnResult> {
    const context = await this.worldState.buildContext(this.getChatIdFromConfig());
    if (!context) throw new Error("No story context available");

    const gmDecision = await this.getGmDecision(context, debugActorId);
    const turnId = randomUUID();
    const turnNumber = this.turnManager.currentTurn + 1;

    if (gmDecision.narration) {
      await this.injectNarration(context.world.id, gmDecision.narration);
    }

    await this.recordGmTurn(context, turnId, turnNumber, gmDecision);

    return {
      turnId,
      turnNumber,
      actorId: gmDecision.nextActorId,
      prompt: gmDecision.turnPrompt,
      response: null,
      qualityEvaluation: null,
      worldEvents: [],
      gmDecision,
      accepted: false,
      escalated: false,
      regenerationSuggested: false,
      narration: gmDecision.narration ?? null,
    };
  }

  /** Accept a response and process it through the full pipeline */
  async acceptResponse(turnId: string, response: string): Promise<GmTurnResult> {
    const turn = await this.db
      .selectFrom("story_turns")
      .selectAll()
      .where("id", "=", turnId)
      .executeTakeFirst();

    if (!turn) throw new Error(`Turn ${turnId} not found`);

    const actor = await this.db
      .selectFrom("actors")
      .select("display_name")
      .where("id", "=", turn.actor_id)
      .executeTakeFirst();

    const context = await this.worldState.buildContext(turn.chat_id);

    const qualityEval = this.evaluator.evaluate({
      response,
      prompt: turn.prompt_sent,
      actorName: actor?.display_name ?? "unknown",
      context: context ?? undefined,
    });

    const worldEvents = extractEvents({
      messageContent: response,
      actorId: turn.actor_id,
      currentLocationId: context?.world.currentLocation.id ?? null,
    });

    if (context) {
      const validated = await validateEvents({ db: this.db, worldId: context.world.id, events: worldEvents });
      if (validated.valid) {
        await applyEvents({ db: this.db, worldId: context.world.id, events: validated.filteredEvents });
      }
    }

    let regenerationSuggested = false;
    let escalated = false;

    if (qualityEval.escalationReason) {
      escalated = true;
      if (this.config.type === GameMasterType.Hybrid || this.config.type === GameMasterType.Human) {
        return this.buildResult({
          turn,
          response,
          qualityEval,
          worldEvents,
          accepted: true,
          escalated: true,
          regenerationSuggested: false,
        });
      }
    }

    if (qualityEval.regenerationReason) {
      const canRegen = await this.turnManager.requestRegeneration(turnId, qualityEval.regenerationReason);
      regenerationSuggested = true;
      if (canRegen) {
        return this.buildResult({
          turn,
          response,
          qualityEval,
          worldEvents,
          accepted: false,
          escalated: false,
          regenerationSuggested: true,
        });
      }
      escalated = true;
    }

    const accepted = !regenerationSuggested && !escalated;
    if (accepted) {
      await this.db
        .updateTable("story_turns")
        .set({
          response_received: response,
          quality_score: qualityEval.scores.overall,
          quality_details: (() => {
            const r = safeJsonStringify(qualityEval.details);
            return r.ok ? r.value : "{}";
          })(),
          status: "accepted",
          completed_at: new Date().toISOString(),
          world_events: (() => {
            const r = safeJsonStringify(worldEvents);
            return r.ok ? r.value : "[]";
          })(),
        })
        .where("id", "=", turnId)
        .execute();

      await this.turnManager.recordTurn();
    }

    return this.buildResult({
      turn,
      response,
      qualityEval,
      worldEvents,
      accepted,
      escalated,
      regenerationSuggested,
    });
  }

  /** Human GM provides an override decision */
  async humanOverride(_chatId: string, turnId: string, decision: GameMasterDecision): Promise<void> {
    const gmSerialized = safeJsonStringify(decision);
    if (!gmSerialized.ok) return;
    await this.db
      .updateTable("story_turns")
      .set({
        gm_decision: gmSerialized.value,
        status: "accepted",
        completed_at: new Date().toISOString(),
      })
      .where("id", "=", turnId)
      .execute();
  }

  /** Inject narration message into the story timeline */
  async injectNarration(worldId: string, text: string): Promise<void> {
    const narrator = await this.db
      .selectFrom("actors")
      .select("id")
      .where("actor_type", "=", "narrator")
      .where("agent_type", "=", "narrator")
      .executeTakeFirst();

    if (!narrator) return;

    const chats = await this.db
      .selectFrom("chats")
      .select("id")
      .where("world_id", "=", worldId)
      .where("mode", "=", "story")
      .execute();

    for (const chat of chats) {
      await this.db
        .insertInto("messages")
        .values({
          id: randomUUID() as string,
          chat_id: chat.id,
          actor_id: narrator.id,
          role: MessageRole.System,
          content: text,
          content_type: MessageContentType.Narration,
          content_format: MessageContentFormat.Markdown,
          content_encoding: ContentEncoding.Identity,
          status: MessageStatus.Confirmed,
          visibility: MessageVisibility.Visible,
        })
        .execute();
    }
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
