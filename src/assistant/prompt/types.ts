// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt assembly section contracts.
 *
 * A prompt is built by running an ordered list of {@link SectionBuilder}s.
 * Each builder decides whether it is {@link SectionBuilder.enabled | enabled}
 * for the current context and returns its messages. Adding a prompt section
 * is one file + one line in the registry — no edits to the orchestrator.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerationMessage, } from "../../generation/gen-types-options";

export interface PromptParams {
  /** Actor generating the response (character/narrator) */
  actorId: string;
  /** Chat to pull message history from */
  chatId: string;
  /** Model ID for token budget lookup */
  modelId: string;
  /** Provider ID for model capability registry lookup */
  providerId?: string;
  /** Override token budget (default: model's contextLimit or 32000) */
  tokenBudget?: number;
  /** Override system prompt (uses actor.system_prompt if absent) */
  systemPromptOverride?: string;
  /** Config-driven default system prompt (used when override and actor prompt are both absent) */
  systemPromptFallback?: string;
  /** Include story context (auto-detected from chat.mode) */
  includeStoryContext?: boolean;
  /** Include lore entries (default: true) */
  includeLore?: boolean;
  /** Include example messages (default: false) */
  includeExamples?: boolean;
  /** Current user's actor ID (for persona/impersonation) */
  userId?: string;
  /** Other participant actor IDs in a group chat (excludes self) */
  groupParticipantIds?: string[];
  /** Explicit selective keys for lore/memory relevance filtering (overrides auto-derived from last user message) */
  selectiveKeys?: string[];
  /** Current emotion context for avatar selection and prompt context */
  emotion?: string;
  /** Emotion avatar asset ID to use for this generation (if pre-selected) */
  emotionAvatar?: string;
  /** Application config — enables config-driven prompt sections (e.g. NSFW policy). */
  config?: Config;
  /** Generation task type for task-clarification injection (e.g. "chat-reply", "vn-choice"). */
  task?: string;
  /** Optional action context for task-clarification injection. */
  action?: string;
  /** Optional assistant persona name for task-clarification injection. */
  assistantName?: string;
  /** Optional game-master name for task-clarification injection. */
  gmName?: string;
}

export interface PromptSectionReport {
  name: string;
  chars: number;
  tokens: number;
  dropped: boolean;
}

export interface AssembledPrompt {
  /** Messages array for LLM request */
  messages: GenerationMessage[];
  /** Separate system prompt (Anthropic-style providers) */
  systemPrompt?: string;
  /** Total token count estimate */
  tokenCount: number;
  /** Token budget that was enforced */
  tokenBudget: number;
  /** Per-section breakdown for debug UI */
  sections: PromptSectionReport[];
}

/** Minimal actor projection the section builders need. */
export interface AssembleActor {
  id: string;
  type?: string | null;
  display_name: string | null;
  system_prompt: string | null;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  post_history_instructions: string | null;
  mes_example: string | null;
  agent_role: string | null;
}

/** Minimal chat projection the section builders need. */
export interface AssembleChat {
  id: string;
  mode: string;
  world_id: string | null;
  current_location_id: string | null;
}

/** Shared inputs handed to every section builder. */
export interface AssembleContext {
  db: Kysely<DB>;
  actor: AssembleActor;
  chat: AssembleChat;
  params: PromptParams;
  isStory: boolean;
  tokenBudget: number;
  /** Application config (optional) — available to config-driven sections. */
  config?: Config;
  /** Generation task type for task-clarification injection. */
  task?: string;
  /** Optional action context for task-clarification injection. */
  action?: string;
  /** Optional assistant persona name for task-clarification injection. */
  assistantName?: string;
  /** Optional game-master name for task-clarification injection. */
  gmName?: string;
}

/** Builds one prompt section's messages. */
export interface SectionBuilder {
  /** Must match a {@link PRIORITY} key for token-budget trimming. */
  name: string;
  enabled: (ctx: AssembleContext,) => boolean;
  build: (ctx: AssembleContext,) => GenerationMessage[] | Promise<GenerationMessage[]>;
}

// ── Priority rank for section dropping ─────────────────────
// Lower rank = kept longer when trimming
export const PRIORITY = {
  system: 0,
  taskClarification: 0,
  actorHeader: 0,
  authorNote: 0,
  groupParticipants: 0,
  userPersona: 0,
  emotionAvatar: 0,
  internalTraits: 1,
  pluginAgentRole: 0,
  chatHistory: 0,
  storyContext: 1,
  travelPrompts: 0,
  gmNotes: 0,
  lore: 2,
  memories: 3,
  dynamicContext: 0,
  recentEvents: 0,
  postHistory: 4,
  examples: 5,
  nsfwPolicy: 0,
} as const;
