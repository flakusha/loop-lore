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

/** Read the editable GM/VN settings out of a chat's persisted GmConfig. */
export function readGmSettings(config: GmConfig,): GmSettingsFields {
  return {
    assistantRole: config.assistantRole ?? "off",
    vnEnabled: config.visualNovel ?? false,
    vnLayout: config.vnLayout ?? "overlay",
    vnTypewriter: config.vnTypewriter ?? true,
    vnTypewriterSpeed: config.vnTypewriterSpeed ?? 30,
    vnTransition: config.vnTransition ?? "fade",
    vnAutoAdvance: config.vnAutoAdvance ?? false,
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
 */
export function buildGmConfig(
  existing: GmConfig,
  fields: GmSettingsFields,
  actorModels: Record<string, { model: string; provider: string }>,
): Record<string, unknown> {
  const gmConfig: Record<string, unknown> = {
    ...existing,
    assistantRole: fields.assistantRole,
    visualNovel: fields.vnEnabled,
    vnLayout: fields.vnLayout,
    vnTypewriter: fields.vnTypewriter,
    vnTypewriterSpeed: fields.vnTypewriterSpeed,
    vnTransition: fields.vnTransition,
    vnAutoAdvance: fields.vnAutoAdvance,
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

/** Drop per-actor overrides whose model is blank. */
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

/** Persist the paused flag into a chat's story_state JSON (mutates the chat). */
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
