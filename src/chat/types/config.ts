// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GameMasterType, } from "../../db/enums-config";
import { ChatRenderingOverride, type ChatRenderingOverrideValue, } from "../../db/enums-core/chat";
import type { OutputStylePreset, } from "../output-style";

/** Chat modes from the DB enum */
export type ChatMode = "direct" | "group" | "story";

/** Feature flags per chat mode */
export interface ModeFeatureFlags {
  /** Context window management (sliding window, pruning) */
  contextWindow: boolean;
  /** Chat transitions (scene changes, context cuts) */
  transitions: boolean;
  /** Memory injection from characters/world */
  memoryInjection: boolean;
  /** Turn-based orchestration */
  turnOrchestration: boolean;
  /** Default rendering when `gm_config.renderingOverride` is `null` */
  defaultRendering: ChatRenderingOverrideValue;
  responseLength: boolean;
  /** Chat autonaming */
  autoRename: boolean;
  /** Quick-regen */
  quickRegen: boolean;
}

/** Default feature flags per chat mode */
export const MODE_DEFAULTS: Record<ChatMode, ModeFeatureFlags> = {
  direct: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: false,
    defaultRendering: "visual_novel",
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  group: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    defaultRendering: "text",
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  story: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    defaultRendering: "visual_novel",
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
} as const;

/**
 * Resolve feature flags for a chat, merging mode defaults with per-chat overrides.
 * @param mode Chat mode whose defaults to use.
 * @param overrides Per-flag overrides (optional).
 */
export function resolveFeatureFlags(
  mode: ChatMode,
  overrides?: Partial<ModeFeatureFlags>,
): ModeFeatureFlags {
  const defaults = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.direct;
  return { ...defaults, ...overrides, };
}

/**
 * Resolve chat rendering by composing `ChatMode` default with the chat's
 * explicit override. The result is the single value every consumer
 * (prompt assembler, VN renderer, settings UI) reads.
 * @param mode Chat mode whose default to use when override is `null`/undefined.
 * @param override Per-chat override (`null` → use mode default).
 */
export function resolveRendering(
  mode: ChatMode,
  override: ChatRenderingOverride | null | undefined,
): ChatRenderingOverrideValue {
  if (override === ChatRenderingOverride.Text) { return "text"; }
  if (override === ChatRenderingOverride.VisualNovel) { return "visual_novel"; }
  return (MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.direct).defaultRendering;
}

/**
 * Chat-level GM configuration. Stored as JSON in `chats.gm_config`.
 *
 * This is the lightweight chat settings config — not the full story-mode
 * `GameMasterConfig` from `src/story/types.ts`. Story mode uses the richer
 * `GameMasterConfig` with LLM settings, human GM, escalation thresholds.
 */
/** Narrative guidance a human Game Master applies to a story chat. */
export interface GmGuidance {
  /** Free-form narrative constraints for the next turn (in-character, topic, tone). */
  constraints: string[];
  /** Character the GM wants to respond next. */
  targetCharacter?: string;
  /** Scene description broadcast to all participants. */
  sceneDescription?: string;
  /** Per-participant turn priority for the next round. */
  turnPriority: Record<string, "high" | "medium" | "low">;
}

/** */
export interface GmConfig {
  /** Assistant's role in this chat: off, helper, gm, or moderator */
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  /** Per-chat rendering override. `null` (default) means "render per ChatMode default" — see `resolveRendering()`. */
  renderingOverride?: ChatRenderingOverride | null;
  /** Visual novel mode (legacy boolean, superseded by `renderingOverride`). */
  visualNovel?: boolean;
  /** VN panel layout. */
  vnLayout?: "overlay" | "below" | "split";
  /** VN typewriter effect enabled. */
  vnTypewriter?: boolean;
  /** VN typewriter speed (ms per character). */
  vnTypewriterSpeed?: number;
  /** VN scene transition style. */
  vnTransition?: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  /** VN auto-advance between scenes. */
  vnAutoAdvance?: boolean;
  /** VN image scaling (contain/cover/fill/auto). */
  vnImageScaling?: "contain" | "cover" | "fill" | "auto";
  /** VN auto-advance delay in seconds. */
  vnAutoAdvanceDelay?: number;
  /** VN dialogue-box opacity (0–1, overlay layout). */
  vnDialogueBoxOpacity?: number;
  /** VN portrait size as percentage of scene width. */
  vnPortraitSize?: number;
  /** VN portrait:text split ratio (split layout). */
  vnSplitRatio?: number;
  storyMode?: boolean;
  /** Active human-GM narrative guidance (persisted, mutable at runtime). */
  gmGuidance?: GmGuidance;
  /**
   * Story-mode GM execution type. Omitted → story mode defaults to LLM.
   * Mirrors `GameMasterType` from `src/db/enums-config`.
   */
  type?: GameMasterType;
  /** Human/hybrid GM: the actor acting as the human Game Master. */
  humanGM?: { actorId: string; notifications: boolean };
  /** Hybrid GM: escalation threshold (0–1) for auto-fallback to LLM. */
  escalationThreshold?: number;
  /**
   * Story-mode GM LLM settings. Consumed by `story-mode.ts` →
   * `GameMasterConfig.llmConfig` → `llmDecision` (model/provider/temperature/
   * maxTokens). Omitted → story mode uses the chat's resolved model.
   */
  llmConfig?: {
    model: string;
    provider: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  };
  /**
   * Per-actor model overrides for multi-LLM story mode. Keyed by actor id;
   * consumed by `story-mode.ts` → `GameMasterConfig.actorModels` →
   * `llmDecision` (per-actor model/provider). Omitted → every actor uses the
   * GM `llmConfig` (or the chat's resolved model).
   */
  actorModels?: Record<string, { model: string; provider: string }>;
  /** Response length preset: short, medium, long, or custom. */
  responseLengthPreset?: "short" | "medium" | "long" | "custom";
  /** Custom token count when preset is "custom" (50–2000). */
  responseLengthCustom?: number;
  /**
   * Output styling (genre/register/tone) for this chat. Resolved via the
   * chat → user → server fallback and injected as a prompt section.
   */
  outputStyle?: {
    preset?: OutputStylePreset;
    customInstruction?: string;
    intensity?: number;
  } | null;
}
