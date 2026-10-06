// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Video prompt template registry (FEAT-065-VID).
 *
 * Mirrors the image `prompt-templates/` shape for the video modality:
 * model profiles live in `video-prompt-profiles.ts`; this module carries
 * the template types, `{{variable}}` substitution, profile resolution,
 * and the role-switch [system, user] LLM messages that draft a video
 * prompt. Video generation has no provider yet — the per-modality apply
 * route answers 501 until one lands.
 */
import type { TemplateDetailLevel, } from "../db/enums";
import {
  detailVerbosity,
  matchModalityProfile,
  type MatchProfileOptions,
  type ModalityProfileRegistry,
  pickModalityTemplate,
  resolveModalityTemplate,
} from "./modality-templates/shared";

/** Builtin profiles + default registry (construction in video-prompt-profiles.ts). */
import { BUILTIN_VIDEO_PROFILES, DEFAULT_VIDEO_PROFILE_REGISTRY, } from "./video-prompt-profiles";
export { BUILTIN_VIDEO_PROFILES, DEFAULT_VIDEO_PROFILE_REGISTRY, };

// ── Model families / formats / modes ────────────────────────

/** */
export type VideoModelFamily = "wan" | "ltx" | "svd" | "animatediff" | "mochi" | "hunyuan";

/** Prompt format the video model expects. */
export type VideoPromptFormat = "natural" | "keyframe-tags" | "json";

/** Generation mode: what sources the clip. */
export type VideoGenMode = "text2video" | "image2video" | "scene" | "last";

/** Freeform variable context substituted into video template bodies. */
export type VideoTemplateContext = Record<string, string>;

/** Declared video template variables (`{{token}}` → source). */
export const VIDEO_TEMPLATE_VARIABLES = {
  subject: "actors.display_name or user input — what the shot depicts",
  motion: "user input / scene — movement across the clip",
  style: "world/actor style settings — look and grading",
  duration: "request param — clip length, e.g. 4s",
  aspectRatio: "request param — e.g. 16:9",
  cameraMovement: "request param — e.g. slow dolly in",
  negativePrompt: "request param — artifacts to avoid",
  charName: "actor display name (cross-modality)",
  userName: "user display name (cross-modality)",
  sceneSummary: "chat scene summary (cross-modality)",
  lastMessage: "last chat message content (cross-modality)",
} as const;

/** Default generation parameters for a video model profile. */
export interface VideoModelDefaults {
  durationSeconds: number;
  aspectRatio: string;
}

/** One template body per detail level. */
export type VideoModeTemplates = Record<TemplateDetailLevel, string>;

/** Profile for one video model family. */
export interface VideoModelProfile {
  id: string;
  name: string;
  families: VideoModelFamily[];
  promptFormat: VideoPromptFormat;
  /** Recommended max tokens for the generated prompt (detailed ceiling). */
  maxTokenHint: number;
  defaults: VideoModelDefaults;
  templates: Record<VideoGenMode, VideoModeTemplates>;
}

/** */
export type VideoProfileRegistry = ModalityProfileRegistry<VideoModelProfile>;

/** */
export interface ResolveVideoProfileOptions extends MatchProfileOptions {
  /** Registry override (DEFAULT_VIDEO_PROFILE_REGISTRY if omitted). */
  registry?: VideoProfileRegistry;
  /** Full template override (e.g. a user template body) — replaces the builtin. */
  templateOverride?: string;
}

/** */
export interface ResolvedVideoProfile {
  profile: VideoModelProfile;
  /** Template body for the mode + detail (override applied). */
  template: string;
  resolvedProfileId: string;
}

/** */
export interface VideoPromptMessage {
  role: "system" | "user";
  content: string;
}

// ── Resolution + message building ───────────────────────────

/**
 * Resolve a video profile + template by profile id, model name, or default.
 * @param mode
 * @param detail - Falls back to the `balanced` body, mirroring the image resolver.
 * @param opts
 */
export function resolveVideoProfile(
  mode: VideoGenMode,
  detail: TemplateDetailLevel,
  opts: ResolveVideoProfileOptions = {},
): ResolvedVideoProfile {
  const registry = opts.registry ?? DEFAULT_VIDEO_PROFILE_REGISTRY;
  const profile = matchModalityProfile(registry, opts,);
  const template = pickModalityTemplate(profile.templates[mode], detail, opts.templateOverride,);
  return { profile, template, resolvedProfileId: profile.id, };
}

/** `resolveTemplate` contract shared across modalities (FEAT-065 parent spec). */
export { resolveModalityTemplate as resolveTemplate, } from "./modality-templates/shared";

/**
 * Role-switch system message for video prompt writing in the profile's
 * format (same pattern as the image `buildImageSystemPrompt`).
 * @param profile
 * @param detail
 */
export function buildVideoSystemPrompt(profile: VideoModelProfile, detail: TemplateDetailLevel,): string {
  const verbosity = detailVerbosity(detail,);
  const formatInstruction = profile.promptFormat === "json"
    ? "Output ONLY a JSON object with subject, motion, camera, style, duration, aspect_ratio fields."
    : profile.promptFormat === "keyframe-tags"
    ? "Output ONLY timestamped markers like [0s: subject enters] [2s: camera pans]."
    : "Output ONLY a flowing description of subject, motion, and style.";

  return [
    `[New Task] Forget previous instructions. You are now a video prompt writer.`,
    `${formatInstruction} Be ${verbosity}. Keep under ${profile.maxTokenHint} tokens.`,
    `No explanation, no markdown, no wrapper text. Do not reference this instruction.`,
  ].join(" ",);
}

/**
 * Build the [system, user] LLM message array for video prompt generation.
 * @param mode
 * @param detail
 * @param ctx
 * @param opts
 */
export function buildVideoPromptMessages(
  mode: VideoGenMode,
  detail: TemplateDetailLevel,
  ctx: VideoTemplateContext,
  opts: ResolveVideoProfileOptions = {},
): VideoPromptMessage[] {
  const { profile, template, } = resolveVideoProfile(mode, detail, opts,);
  return [
    { role: "system", content: buildVideoSystemPrompt(profile, detail,), },
    { role: "user", content: resolveModalityTemplate(template, ctx,), },
  ];
}
