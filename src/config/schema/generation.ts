// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/generation.ts — Generation config type

import type { OutputStylePreset, } from "../../chat/output-style";
import type { AutoStartConfig, } from "./auto-start";
import type { GenerationProvidersConfig, } from "./providers";

export interface ModelRoleAssignment {
  /** Provider name (must match a registered provider) */
  provider: string;
  /** Model ID within the provider */
  model: string;
}

export interface RegexTransform {
  /** Human-readable name for this transform */
  name: string;
  /** Regex pattern string */
  pattern: string;
  /** Replacement string (supports $1, $2, etc.) */
  replacement: string;
  /** Regex flags - default 'g' (global). Use 'gi' for case-insensitive. */
  flags?: string;
  /** Whether this transform is active */
  enabled: boolean;
  /**
   * Pipeline phase this transform runs in. Phases execute in canonical order
   * (edit-input → output → process → display) regardless of list position.
   * Default `"output"` preserves the pre-split single-phase behavior (LLM
   * output transformed before persistence/display).
   */
  phase?: RegexTransformPhase;
}

/** Pipeline phase for a regex transform. */
export type RegexTransformPhase = "edit-input" | "output" | "process" | "display";

export interface GenerationConfig {
  /** Provider configurations */
  providers: GenerationProvidersConfig;
  /** Default provider name when none specified per-chat */
  defaultProvider: string;
  /** Default model per provider (providerName → modelId) */
  defaultModels: Record<string, string>;
  /** Auto-spawn external AI servers at startup (llama.cpp, sd.cpp) */
  autoStart?: AutoStartConfig;
  /** Default streaming mode when chat-level setting is null. null = use provider capability */
  defaultStream?: boolean | null;
  /** Default model role assignments (config-level, overridden by DB) */
  modelRoles?: {
    /** Primary reasoning model */
    main?: ModelRoleAssignment;
    /** Lightweight model for fast decisions, intent classification, short tasks */
    auxiliary?: ModelRoleAssignment;
    /** Vision/LM model for captioning */
    captioning?: ModelRoleAssignment;
  };
  /** Regex transforms applied to LLM output before display */
  regexTransforms?: RegexTransform[];
  /** Emotion avatar generation settings */
  emotionAvatar?: {
    /** Fallback mode when edit model is unavailable: "generation" uses txt2img, "none" disables fallback */
    fallbackMode?: "generation" | "none";
  };
  /** Server-wide defaults for chat-level generation features. */
  chatDefaults?: GenerationChatDefaults;
}

/** Server-wide defaults applied when a chat/user doesn't override. */
export interface GenerationChatDefaults {
  /** Default output-style preset (null = no default style). */
  outputStyle?: OutputStylePreset | null;
}
