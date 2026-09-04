// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-settings GM config helpers.
 *
 * Pure read/build helpers for the chat's persisted `gm_config` blob used by
 * the chat settings modal (LLM/human/hybrid GM fields, VN display keys and
 * per-actor model overrides). Extracted so `chat-settings.ts` stays under the
 * 250L file-size guard.
 */

import type { OutputStylePreset, } from "../../../chat/output-style";
import { jsonParseOr, safeJsonStringify, } from "../json";
import type { GmConfig, } from "../types";

/** Flat view of the GM/VN settings a user can edit in the chat settings modal. */
export interface GmSettingsFields {
  assistantRole: "off" | "helper" | "gm" | "moderator";
  vnEnabled: boolean;
  vnLayout: "overlay" | "below" | "split";
  vnTypewriter: boolean;
  vnTypewriterSpeed: number;
  vnTransition: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  vnAutoAdvance: boolean;
  imageScaling: "contain" | "cover" | "fill" | "auto";
  autoAdvanceDelay: number;
  dialogueBoxOpacity: number;
  portraitSize: number;
  splitRatio: number;
  gmType: "llm" | "human" | "hybrid";
  gmHumanActorId: string;
  gmEscalationThreshold: number;
  gmModel: string;
  gmProvider: string;
  gmTemperature: number;
  gmMaxTokens: number;
  responseLengthPreset: "short" | "medium" | "long" | "custom";
  responseLengthCustom: number;
  /** "" = no style directive (section stays off). */
  outputStylePreset: "" | OutputStylePreset;
  outputStyleIntensity: number;
}

/**
 * Read the editable GM/VN settings out of a chat's persisted GmConfig.
 * @param config
 */
export function readGmSettings(config: GmConfig,): GmSettingsFields {
  return {
    assistantRole: config.assistantRole ?? "off",
    vnEnabled: config.renderingOverride === "visual_novel" ||
      (config.renderingOverride == null && (config.visualNovel ?? false)),
    vnLayout: config.vnLayout ?? "overlay",
    vnTypewriter: config.vnTypewriter ?? true,
    vnTypewriterSpeed: config.vnTypewriterSpeed ?? 30,
    vnTransition: config.vnTransition ?? "fade",
    vnAutoAdvance: config.vnAutoAdvance ?? false,
    imageScaling: config.vnImageScaling ?? "auto",
    autoAdvanceDelay: config.vnAutoAdvanceDelay ?? 5,
    dialogueBoxOpacity: config.vnDialogueBoxOpacity ?? 0.75,
    portraitSize: config.vnPortraitSize ?? 35,
    splitRatio: config.vnSplitRatio ?? 40,
    gmType: config.type ?? "llm",
    gmHumanActorId: config.humanGM?.actorId ?? "",
    gmEscalationThreshold: config.escalationThreshold ?? 0.5,
    gmModel: config.llmConfig?.model ?? "",
    gmProvider: config.llmConfig?.provider ?? "",
    gmTemperature: config.llmConfig?.temperature ?? 0.7,
    gmMaxTokens: config.llmConfig?.maxTokens ?? 2000,
    responseLengthPreset: config.responseLengthPreset ?? "medium",
    responseLengthCustom: config.responseLengthCustom ?? 1000,
    outputStylePreset: config.outputStyle?.preset ?? "",
    outputStyleIntensity: config.outputStyle?.intensity ?? 0.5,
  };
}

/**
 * Build the gm_config payload to persist, merging edited fields onto any
 * existing config and pruning sections that no longer apply.
 * @param existing
 * @param fields
 * @param actorModels
 */
export function buildGmConfig(
  existing: GmConfig,
  fields: GmSettingsFields,
  actorModels: Record<string, { model: string; provider: string }>,
): Record<string, unknown> {
  const gmConfig: Record<string, unknown> = {
    ...existing,
    assistantRole: fields.assistantRole,
    renderingOverride: fields.vnEnabled ? "visual_novel" : null,
    vnLayout: fields.vnLayout,
    vnTypewriter: fields.vnTypewriter,
    vnTypewriterSpeed: fields.vnTypewriterSpeed,
    vnTransition: fields.vnTransition,
    vnAutoAdvance: fields.vnAutoAdvance,
    vnImageScaling: fields.imageScaling,
    vnAutoAdvanceDelay: fields.autoAdvanceDelay,
    vnDialogueBoxOpacity: fields.dialogueBoxOpacity,
    vnPortraitSize: fields.portraitSize,
    vnSplitRatio: fields.splitRatio,
    type: fields.gmType,
  };
  if (fields.gmModel.trim()) {
    gmConfig.llmConfig = {
      model: fields.gmModel.trim(),
      provider: fields.gmProvider.trim(),
      systemPrompt: "",
      temperature: fields.gmTemperature,
      maxTokens: fields.gmMaxTokens,
    };
  } else {
    delete gmConfig.llmConfig;
  }
  const filteredActorModels = buildActorModels(actorModels,);
  if (Object.keys(filteredActorModels,).length > 0) {
    gmConfig.actorModels = filteredActorModels;
  } else {
    delete gmConfig.actorModels;
  }
  if (fields.gmType === "human" || fields.gmType === "hybrid") {
    gmConfig.humanGM = { actorId: fields.gmHumanActorId, notifications: true, };
  } else {
    delete gmConfig.humanGM;
  }
  if (fields.gmType === "hybrid") {
    gmConfig.escalationThreshold = fields.gmEscalationThreshold;
  } else {
    delete gmConfig.escalationThreshold;
  }
  gmConfig.responseLengthPreset = fields.responseLengthPreset;
  if (fields.responseLengthPreset === "custom") {
    gmConfig.responseLengthCustom = fields.responseLengthCustom;
  } else {
    delete gmConfig.responseLengthCustom;
  }
  if (fields.outputStylePreset) {
    gmConfig.outputStyle = {
      preset: fields.outputStylePreset,
      intensity: fields.outputStyleIntensity,
    };
  } else {
    delete gmConfig.outputStyle;
  }
  return gmConfig;
}

/**
 * `gmConfig` sub-keys that are presentation (display) state, mirroring the
 * backend `GM_CONFIG_PRESENTATION_KEYS` in `src/chat/service/access.ts`. Only
 * these may be mutated once a chat is online; the GM-execution keys stay
 * immutable.
 */
export const GM_CONFIG_PRESENTATION_KEYS = [
  "renderingOverride",
  "visualNovel",
  "vnLayout",
  "vnTypewriter",
  "vnTypewriterSpeed",
  "vnTransition",
  "vnAutoAdvance",
  "vnImageScaling",
  "vnAutoAdvanceDelay",
  "vnDialogueBoxOpacity",
  "vnPortraitSize",
  "vnSplitRatio",
  "responseLengthPreset",
  "responseLengthCustom",
  "outputStyle",
] as const;

/**
 * Subset a full `gmConfig` blob to only the presentation keys, safe to send on
 * an online chat (the backend 409s on any other key). Keeps the backend
 * authoritative while the online path forwards only mutable display state.
 * @param gmConfig
 */
export function presentationGmConfig(
  gmConfig: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of GM_CONFIG_PRESENTATION_KEYS) {
    if (gmConfig[key] !== undefined) { out[key] = gmConfig[key]; }
  }
  return out;
}

/**
 * Drop per-actor overrides whose model is blank.
 * @param actorModels
 */
export function buildActorModels(
  actorModels: Record<string, { model: string; provider: string }>,
): Record<string, { model: string; provider: string }> {
  const result: Record<string, { model: string; provider: string }> = {};
  for (const [actorId, m,] of Object.entries(actorModels,)) {
    if (m.model?.trim()) {
      result[actorId] = { model: m.model.trim(), provider: m.provider?.trim() ?? "", };
    }
  }
  return result;
}

/**
 * Persist the paused flag into a chat's story_state JSON (mutates the chat).
 * @param chat
 * @param chat.story_state
 * @param isPaused
 */
export function setStoryPaused(chat: { story_state?: string }, isPaused: boolean,): void {
  if (chat.story_state) {
    const st = jsonParseOr<Record<string, unknown>>(chat.story_state, {},);
    st.isPaused = isPaused;
    const serialized = safeJsonStringify(st,);
    chat.story_state = serialized.ok ? serialized.value : chat.story_state;
  } else {
    const serialized = safeJsonStringify({ isPaused: isPaused, },);
    chat.story_state = serialized.ok ? serialized.value : "{}";
  }
}
