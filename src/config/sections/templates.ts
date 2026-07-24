// src/config/sections/templates.ts — Template config section
//
// Defines types and defaults for the config-driven template system.
// Supports replace/extend/override merge strategies per domain.

import type {
  DetailLevel,
  SdGenMode,
} from "../../generation/prompt-templates";

// ── Merge Strategy ──────────────────────────────────────────

/** Per-domain merge strategy */
export type MergeStrategy = "replace" | "extend" | "override";

// ── LLM Templates ───────────────────────────────────────────

/** System prompt templates keyed by purpose */
export interface LlmSystemPrompts {
  /** Main chat system prompt */
  chat: string;
  /** Summarization prompt */
  summarize: string;
  /** Image prompt generation instruction */
  imagePrompt: string;
  /** Out-of-character / GM narration */
  ooc: string;
  /** Custom prompts keyed by name */
  [key: string]: string;
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

// ── Combined TemplatesConfig ─────────────────────────────────

/** Top-level templates configuration */
export interface TemplatesConfig {
  llm: LlmTemplateConfig;
  sd: SdTemplateConfig;
  avatar: AvatarTemplateConfig;
  imageEdit: ImageEditTemplateConfig;
}

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_MERGE: MergeStrategy = "extend";

export const TEMPLATES_DEFAULTS: TemplatesConfig = {
  llm: {
    merge: DEFAULT_MERGE,
    systemPrompts: {
      chat: "You are {{charName}}. {{charDescription}}",
      summarize: "Summarize this conversation concisely.",
      imagePrompt: "Write image generation tags for: {{scene}}",
      ooc: "You are the game master. Narrate the scene.",
    },
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
};
