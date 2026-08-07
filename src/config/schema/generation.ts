// src/config/schema/generation.ts — Generation config type

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
}

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
}
