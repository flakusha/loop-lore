/**
 * Game Master decision strategy contracts.
 *
 * A decision strategy produces the next {@link GameMasterDecision} for a
 * selected actor given the current story context. Strategies are keyed by
 * {@link GameMasterType} in the registry so adding a mode is one file + one
 * registry line — no switch to edit.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { GmGuidance, } from "../../../chat/types/config";
import type { DB, } from "../../../db/schema";
import type { GenerationMessage, } from "../../../generation/types";
import type { GameMasterConfig, GameMasterDecision, StoryContext, } from "../../types";

/** Function provided by the caller to actually invoke an LLM. */
export type GenerateTextFn = (params: {
  messages: GenerationMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: string;
  model?: string;
},) => Promise<string>;

/** Shared dependencies every decision strategy needs from the GM service. */
export interface GmDecisionDeps {
  config: GameMasterConfig;
  /** App-level config — enables config-driven prompt sections (e.g. NSFW policy) during assembly. */
  appConfig?: Config;
  generateText: GenerateTextFn;
  db: Kysely<DB>;
  chatId: string;
  /** Config-driven default GM system prompt (used when config.llmConfig.systemPrompt is absent) */
  systemPromptDefault?: string;
  /** Human-GM narrative guidance steering this turn (from chat gm_config). */
  gmGuidance?: GmGuidance;
}

/** Produces the next turn decision for a selected actor. */
export type GmDecisionStrategy = (
  deps: GmDecisionDeps,
  context: StoryContext,
  actorId: string,
) => GameMasterDecision | Promise<GameMasterDecision>;
