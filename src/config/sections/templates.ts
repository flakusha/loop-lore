// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// Defines types and defaults for the config-driven template system.

import type {
  DetailLevel,
  SdGenMode,
} from "../../generation/prompt-templates";
import type { WorkflowTemplateConfig, } from "./templates-workflow";

// ── Merge Strategy ──────────────────────────────────────────

/** Per-domain merge strategy */
export type MergeStrategy = "replace" | "extend" | "override";

// ── LLM Templates ───────────────────────────────────────────

/** System prompt templates keyed by purpose */
export interface LlmSystemPrompts {
  /** Main chat system prompt (generic baseline; actors usually define their own) */
  chat?: string;
  /** Summarization prompt */
  summarize?: string;
  /** Image prompt generation instruction */
  imagePrompt?: string;
  /** Out-of-character / GM narration */
  ooc?: string;
  /** Assistant mode system prompt */
  assistant?: string;
  /** GM turn-taking system prompt */
  gm?: string;
  /** NSFW content-rating classification */
  nsfw?: string;
  /** NSFW policy system message describing the SFW/NSFW level taxonomy */
  nsfwPolicy?: string;
  /** VN scene description generation */
  vn?: string;
  /** VN branching choice generation */
  vnChoices?: string;
  /** Aux: chat → scene transition classification */
  transition?: string;
  /** Aux: pre-generation intent classification */
  intent?: string;
  /** Aux: memory extraction */
  memory?: string;
  /** Custom prompts keyed by name */
  [key: string]: string | undefined;
}

/** Chat format template (for Jinja/vLLM-style formatting) */
export interface ChatFormatTemplate {
  system: string;
  user: string;
  assistant: string;
}

/** LLM template configuration */
export interface LlmTemplateConfig {
  merge: MergeStrategy;
  systemPrompts: LlmSystemPrompts;
  chatFormats: Record<string, ChatFormatTemplate>;
  /**
   * Per-entity-kind prompt templates for the `/create` assistant command.
   * Keyed by canonical entity kind (`character | location | world | item`).
   * Overrides the built-in default prompt for that kind; the value should
   * contain a `{description}` placeholder.
   */
  entityGeneration?: Partial<Record<"character" | "location" | "world" | "item", string>>;
}

// ── SD Templates ────────────────────────────────────────────

/** Config-driven SD template overrides (subset of ImageModelProfile) */
export interface SdProfileOverride {
  id: string;
  name: string;
  families: string[];
  promptFormat: string;
  maxTokenHint: number;
  defaults: {
    cfgScale: number;
    steps: number;
    sampler: string;
    scheduler?: string;
    clipSkip?: number;
  };
  /** Templates keyed by detail level, then by gen mode */
  templates?: Record<DetailLevel, Partial<Record<SdGenMode, string>>>;
}

/** Model matching rule for config */
export interface ModelMatchingRule {
  pattern: string;
  profileId: string;
}

/** SD template configuration */
export interface SdTemplateConfig {
  merge: MergeStrategy;
  profiles: Record<string, SdProfileOverride>;
  modelMatching: ModelMatchingRule[];
}

// ── Avatar Templates ────────────────────────────────────────

/** Emotion-to-asset mapping */
export interface EmotionEntry {
  /** Asset filename or path */
  asset: string;
  /** Intent description for LLM context */
  intent: string;
  /** Optional prompt override for this emotion */
  prompt?: string;
}

/** Intent pattern for avatar change detection */
export interface AvatarIntentPattern {
  /** Text pattern to match (regex or substring) */
  pattern: string;
  /** Target emotion key */
  emotion: string;
}

/** Avatar template configuration */
export interface AvatarTemplateConfig {
  merge: MergeStrategy;
  /** Emotion key -> asset mapping */
  emotions: Record<string, EmotionEntry>;
  /** Patterns for detecting avatar change intent */
  intentPatterns: AvatarIntentPattern[];
}

// ── Image-Edit Templates ────────────────────────────────────

/** Config-driven image-edit workflow definition */
export interface ImageEditWorkflowConfig {
  id: string;
  name: string;
  category: string;
  backend: string;
  description: string;
  /** Workflow nodes (ComfyUI format) */
  nodes?: Record<string, unknown>;
}
/** Image-edit template configuration */
export interface ImageEditTemplateConfig {
  merge: MergeStrategy;
  workflows: Record<string, ImageEditWorkflowConfig>;
}

export type {
  AssistantWorkflowConfig,
  WorkflowApprovalConfig,
  WorkflowDispatchConfig,
  WorkflowStepConfig,
  WorkflowTemplateConfig,
} from "./templates-workflow";
// ── Combined TemplatesConfig ─────────────────────────────────

/** Top-level templates configuration */
export interface TemplatesConfig {
  llm: LlmTemplateConfig;
  sd: SdTemplateConfig;
  avatar: AvatarTemplateConfig;
  imageEdit: ImageEditTemplateConfig;
  character: CharacterTemplateConfig;
  workflows: WorkflowTemplateConfig;
}

// ── Character Template Config ───────────────────────────────

/** Character template configuration loaded from configs/templates/character.yaml */
export interface CharacterTemplateConfig {
  merge: MergeStrategy;
  templates: {
    id?: string;
    name: string;
    description: string;
    personality?: string;
    scenario?: string;
    welcome_message?: string;
    system_prompt?: string;
    mes_example?: string;
    tags?: string[];
    creator?: string;
    visibility?: "private" | "public";
    content_rating?: "sfw" | "nsfw_mild" | "nsfw_moderate" | "nsfw_intense" | "nsfw_extreme";
    target_roles?: ("admin" | "user" | "viewer" | "solo")[];
    is_template?: boolean;
    is_default?: boolean;
    // ── Wardrobe / Outfits (epic-wardrobe-avatar-variants.md) ──
    default_outfit?: string;
    outfits?: CharacterOutfit[];
    loadouts?: CharacterLoadout[];
  }[];
}

/** Wardrobe outfit descriptor — mirrors CharacterOutfitTemplate in sections/characters/types.ts */
export interface CharacterOutfit {
  id: string;
  name: string;
  descriptor: string;
  tags?: string[];
}

/** Loadout bridge entry — mirrors CharacterLoadoutTemplate in sections/characters/types.ts */
export interface CharacterLoadout {
  name: string;
  slot: string;
  item_match: string;
  outfit: string;
}

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_MERGE: MergeStrategy = "extend";

export const TEMPLATES_DEFAULTS: TemplatesConfig = {
  llm: {
    merge: DEFAULT_MERGE,
    // Defaults live in src/prompts/registry.ts (LLM_PROMPT_DEFAULTS) — the
    // config layer is user overrides only, so this starts empty. Keeps a single
    // source of truth for default prompts without inverting import layering.
    systemPrompts: {},
    chatFormats: {},
  },
  sd: {
    merge: DEFAULT_MERGE,
    profiles: {},
    modelMatching: [],
  },
  avatar: {
    merge: DEFAULT_MERGE,
    emotions: {},
    intentPatterns: [],
  },
  imageEdit: {
    merge: DEFAULT_MERGE,
    workflows: {},
  },
  character: {
    merge: DEFAULT_MERGE,
    templates: [],
  },
  workflows: {
    merge: DEFAULT_MERGE,
    workflows: {},
  },
};
