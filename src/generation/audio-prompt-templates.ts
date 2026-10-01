// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audio/sound prompt template registry (FEAT-065-AUD).
 *
 * Mirrors the image `prompt-templates/` shape for the audio modality:
 * model profiles live in `audio-prompt-profiles.ts`; this module carries
 * the template types, `{{variable}}` substitution, profile resolution,
 * and the role-switch [system, user] LLM messages that draft TTS, SFX,
 * and music prompts. Audio generation has no provider yet (FEAT-089/090/091
 * are future) — the per-modality apply route answers 501 until one lands.
 */
import type { TemplateDetailLevel, } from "../db/enums";
import {
  matchModalityProfile,
  type MatchProfileOptions,
  type ModalityProfileRegistry,
  resolveModalityTemplate,
} from "./modality-templates/shared";

/** Builtin profiles + default registry (construction in audio-prompt-profiles.ts). */
import { BUILTIN_AUDIO_PROFILES, DEFAULT_AUDIO_PROFILE_REGISTRY, } from "./audio-prompt-profiles";
export { BUILTIN_AUDIO_PROFILES, DEFAULT_AUDIO_PROFILE_REGISTRY, };

/** `resolveTemplate` contract shared across modalities (FEAT-065 parent spec). */
export { resolveModalityTemplate as resolveTemplate, } from "./modality-templates/shared";

// ── Sub-types / families / formats ──────────────────────────

/** Audio generation sub-type. */
export type AudioSubtype = "tts" | "sfx" | "music" | "voice-clone";

/** */
export type AudioModelFamily =
  | "elevenlabs"
  | "openai-tts"
  | "piper"
  | "bark"
  | "stable-audio"
  | "musicgen"
  | "riffusion";

/** Prompt format the audio model expects. */
export type AudioPromptFormat = "natural" | "ssml" | "json";

/** Freeform variable context substituted into audio template bodies. */
export type AudioTemplateContext = Record<string, string>;

/** Declared audio template variables (`{{token}}` → source). */
export const AUDIO_TEMPLATE_VARIABLES = {
  speaker: "actors.display_name / voice_id — who speaks or is cloned",
  emotion: "request param — delivery emotion, e.g. excited",
  tone: "request param — vocal tone, e.g. whisper",
  pace: "request param — speaking pace, e.g. slow",
  genre: "request param — music genre, e.g. fantasy orchestral",
  mood: "request param — scene mood, e.g. epic battle",
  instrumentation: "request param — e.g. drums, brass",
  text: "message content — the text to speak or describe",
  charName: "actor display name (cross-modality)",
  userName: "user display name (cross-modality)",
  lastMessage: "last chat message content (cross-modality; TTS text)",
} as const;

/** One template body per detail level. */
export type AudioModeTemplates = Record<TemplateDetailLevel, string>;

/** Profile for one audio model family. */
export interface AudioModelProfile {
  id: string;
  name: string;
  families: AudioModelFamily[];
  /** Sub-types this profile can generate; others resolve with an error. */
  subtypes: AudioSubtype[];
  promptFormat: AudioPromptFormat;
  /** Recommended max tokens for the generated prompt (detailed ceiling). */
  maxTokenHint: number;
  templates: Record<AudioSubtype, AudioModeTemplates>;
}

/** */
export type AudioProfileRegistry = ModalityProfileRegistry<AudioModelProfile>;

/** */
export interface ResolveAudioProfileOptions extends MatchProfileOptions {
  /** Registry override (DEFAULT_AUDIO_PROFILE_REGISTRY if omitted). */
  registry?: AudioProfileRegistry;
  /** Full template override (e.g. a user template body) — replaces the builtin. */
  templateOverride?: string;
}

/** */
export interface ResolvedAudioProfile {
  profile: AudioModelProfile;
  /** Template body for the subtype + detail (override applied). */
  template: string;
  resolvedProfileId: string;
}

/** */
export interface AudioPromptMessage {
  role: "system" | "user";
  content: string;
}

// ── Resolution + message building ───────────────────────────

/**
 * Resolve an audio profile + template by profile id, model name, or default.
 * @param subtype - Audio sub-type the prompt targets
 * @param detail - Falls back to the `balanced` body, mirroring the image resolver.
 * @throws {Error} When the resolved profile does not support `subtype`.
 */
export function resolveAudioProfile(
  subtype: AudioSubtype,
  detail: TemplateDetailLevel,
  opts: ResolveAudioProfileOptions = {},
): ResolvedAudioProfile {
  const registry = opts.registry ?? DEFAULT_AUDIO_PROFILE_REGISTRY;
  const profile = matchModalityProfile(registry, opts,);
  if (!profile.subtypes.includes(subtype,)) {
    throw new Error(`Audio profile "${profile.id}" does not support the "${subtype}" subtype`,);
  }
  const subtypeTemplates = profile.templates[subtype];
  let template = subtypeTemplates[detail] ?? subtypeTemplates.balanced;
  if (opts.templateOverride !== undefined) { template = opts.templateOverride; }
  return { profile, template, resolvedProfileId: profile.id, };
}

/**
 * Role-switch system message for audio prompt writing in the profile's
 * format (same pattern as the image `buildImageSystemPrompt`).
 */
export function buildAudioSystemPrompt(
  profile: AudioModelProfile,
  subtype: AudioSubtype,
  detail: TemplateDetailLevel,
): string {
  const verbosity = detail === "instant" ? "short" : (detail === "balanced" ? "concise" : "detailed");
  const formatInstruction = profile.promptFormat === "json"
    ? "Output ONLY a JSON object describing the audio."
    : profile.promptFormat === "ssml"
    ? "Output ONLY valid SSML wrapped in <speak>...</speak>."
    : "Output ONLY a natural language style direction.";
  return [
    `[New Task] Forget previous instructions. You are now an audio prompt writer.`,
    `Target: a ${subtype} clip. ${formatInstruction} Be ${verbosity}.`,
    `Keep under ${profile.maxTokenHint} tokens. No explanation, no wrapper text.`,
  ].join(" ",);
}

/** Build the [system, user] LLM message array for audio prompt generation. */
export function buildAudioPromptMessages(
  subtype: AudioSubtype,
  detail: TemplateDetailLevel,
  ctx: AudioTemplateContext,
  opts: ResolveAudioProfileOptions = {},
): AudioPromptMessage[] {
  const { profile, template, } = resolveAudioProfile(subtype, detail, opts,);
  return [
    { role: "system", content: buildAudioSystemPrompt(profile, subtype, detail,), },
    { role: "user", content: resolveModalityTemplate(template, ctx,), },
  ];
}
