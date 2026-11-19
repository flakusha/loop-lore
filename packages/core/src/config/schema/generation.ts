// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/generation.ts — Generation config type

import type { OutputStylePreset, } from "@/chat/output-style";
import type { GenerationRoutingConfig, } from "@/generation/routing/routing-config";
import type { AutoStartConfig, } from "./auto-start";
import type { GenerationProvidersConfig, } from "./providers";

/** */
export interface ModelRoleAssignment {
  /** Provider name (must match a registered provider) */
  provider: string;
  /** Model ID within the provider */
  model: string;
}

/** */
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
/** Per-model browser download override (wins over the instance default). */
export interface LocalModelDownloadModelConfig {
  /** False blocks this model even when downloads are allowed by default. */
  allowDownload?: boolean;
}

/** Browser-model download policy (admin default plus per-model overrides). */
export interface LocalModelDownloadConfig {
  /** Instance default. Default true when omitted. */
  allowDownloads?: boolean;
  /** Per-model overrides keyed by catalog id. Unknown ids are ignored. */
  models?: Record<string, LocalModelDownloadModelConfig>;
}

/** Matting (background removal) backend selection. */
export interface MattingConfig {
  /**
   * Which backend executes background removal. "none" (default when the
   * section is absent) disables matting entirely — raw assets stay usable.
   * "auto" prefers ComfyUI (when an sd provider with apiFamily "comfyui" is
   * configured), then the rembg HTTP sidecar, then the generic HTTP endpoint.
   */
  backend: "none" | "http" | "rembg" | "comfy" | "auto";
  /**
   * HTTP endpoint. For "http": a URL accepting POST image bytes and returning
   * PNG bytes. For "rembg": the rembg server base URL (e.g.
   * `http://127.0.0.1:7000`); the client appends `/api/remove`.
   */
  endpoint?: string;
  /**
   * Matting model id. "rembg": model name (default `isnet-general-use`; the
   * rembg default `bria-rmbg` and `RMBG-*` weights are non-commercial — pin a
   * permissive model). "comfy": background-removal weights file name (default
   * `birefnet.safetensors`, MIT).
   */
  model?: string;
  /** Optional bearer token sent by the generic "http" provider. */
  apiKey?: string;
  /** Request timeout in ms (default 120000). */
  timeoutMs?: number;
  /** rembg only: request color decontamination on soft edges (default true). */
  decontaminate?: boolean;
  /** Auto-enqueue matting after emotion-avatar generation (default true). */
  autoEnqueue?: boolean;
}

/** Rate + concurrency regulation for generation endpoints. */
export interface GenerationFlowControl {
  /** Max simultaneous tracked generations server-wide. 0 = unbounded. */
  maxConcurrentGlobal?: number;
  /** Max simultaneous tracked generations per chat. 0 = unbounded. */
  maxConcurrentPerChat?: number;
}

/** Backend ordering policy for assistant-side image generation (`/image`).
 * Ordering only — the failover chain still answers when the preferred family
 * is skipped, and every candidate stays probe-gated. */
export interface ImageRoutingConfig {
  /** Prefer a healthy ComfyUI instance (stored setup or config provider) for
   * `/image` generation: ComfyUI candidates are ordered ahead of the rest of
   * the failover chain. Default false — config order decides. */
  comfyUiFirst?: boolean;
}

/** Use-case scenarios that can drive ranking-based model-role autoroute. */
export const AUTOROUTE_SCENARIOS = [
  "general",
  "chat",
  "coding",
  "local",
  "observed",
] as const;

/** One of {@link AUTOROUTE_SCENARIOS}. */
export type AutorouteScenario = (typeof AUTOROUTE_SCENARIOS)[number];

/** */
export interface GenerationConfig {
  /** Provider configurations */
  providers: GenerationProvidersConfig;
  /** `/image` backend ordering policy (default: config order). */
  imageRouting?: ImageRoutingConfig;
  /** Default provider name when none specified per-chat */
  defaultProvider: string;
  /** Default model per provider (providerName → modelId) */
  defaultModels: Record<string, string>;
  /** Use-case scenario whose ranking rows select unassigned model roles.
   * Unset (default) keeps the previous manual/default behavior. */
  autorouteScenario?: AutorouteScenario;
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
    /** Dedicated encoder classifier (Laya/Jev-class); unset resolves via the default provider chain */
    classifier?: ModelRoleAssignment;
    /**
     * Translation model for /translate and per-chat auto-translate.
     * Unset (or set without BOTH provider and model) resolves to the general
     * model — see resolveTranslatorProvider.
     */
    translator?: ModelRoleAssignment;
    /** Dedicated cross-encoder rerank; unset falls back to RERANK_MODEL. */
    rerank?: ModelRoleAssignment;
  };
  /** Model routing policy (see generation/routing/). Default is a no-op. */
  routing?: GenerationRoutingConfig;
  /** Regex transforms applied to LLM output before display */
  regexTransforms?: RegexTransform[];
  /** Emotion avatar generation settings */
  emotionAvatar?: {
    /** Fallback mode when edit model is unavailable: "generation" uses txt2img, "none" disables fallback */
    fallbackMode?: "generation" | "none";
  };
  /** Browser-model download policy: admin default plus per-model overrides. */
  localModels?: LocalModelDownloadConfig;
  /** Background-removal (matting) backend for avatar/sprite cut-outs. */
  matting?: MattingConfig;
  /** Server-wide defaults for chat-level generation features. */
  chatDefaults?: GenerationChatDefaults;
  /** Rate + concurrency regulation for generation endpoints. */
  flowControl?: GenerationFlowControl;
}

/** Server-wide defaults applied when a chat/user doesn't override. */
export interface GenerationChatDefaults {
  /** Default output-style preset (null = no default style). */
  outputStyle?: OutputStylePreset | null;
}
