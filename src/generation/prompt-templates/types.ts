// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Model family classification ─────────────────────────────

export type ImageModelFamily =
  | "sd1"
  | "sd2"
  | "sdxl"
  | "illustrious"
  | "noob"
  | "pony"
  | "sd3"
  | "flux"
  | "krea2"
  | "anima"
  | "ideogram"
  | "qwen"
  | "chroma";

/** Prompt format the image model expects */
export type PromptFormat = "tags" | "natural" | "tags-and-natural" | "json";

/** Generation mode for SD prompt generation */
export type SdGenMode = "yourself" | "face" | "me" | "scene" | "last" | "raw_last" | "background" | "free";

/** Detail level: instant = fast/low-token, detailed = rich/high-token */
export type DetailLevel = "instant" | "balanced" | "detailed";

/** Per-model template overrides for each gen mode */
export interface ImageModelTemplates {
  yourself: string;
  face: string;
  me: string;
  scene: string;
  last: string;
  background: string;
}

/** Default generation parameters for a model profile */
export interface ModelDefaults {
  cfgScale: number;
  steps: number;
  sampler: string;
  scheduler?: string;
  clipSkip?: number;
}

/** Profile for one image model family */
export interface ImageModelProfile {
  id: string;
  name: string;
  families: ImageModelFamily[];
  promptFormat: PromptFormat;
  /** Recommended max tokens for the generated prompt */
  maxTokenHint: number;
  /** Default gen params */
  defaults: ModelDefaults;
  /** Prompt templates per gen mode, keyed by detail level */
  templates: Record<DetailLevel, ImageModelTemplates>;
}

/** Registry of all model profiles */
export interface ImageModelProfileRegistry {
  profiles: Record<string, ImageModelProfile>;
  defaultProfileId: string;
  /** Match model name patterns to profile IDs (first match wins) */
  modelMatching?: { pattern: string; profileId: string }[];
}

/** Variables substituted into templates */
export interface TemplateContext {
  charName: string;
  charDescription: string;
  userName: string;
  userDescription: string;
  lastMessage: string;
  sceneSummary: string;
  chatHistory: string;
  negativePrompt?: string;
  charPrefix?: string;
  extra?: Record<string, string>;
}
