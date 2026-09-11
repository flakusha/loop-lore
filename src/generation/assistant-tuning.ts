// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat assistant tuning override (`gm_config.assistantTuning`).
 *
 * Resolution chain for sampling params on the regular assistant path:
 * explicit request value → per-chat override → provider default. Range
 * validation reuses the frontend clamp helpers
 * (`src/frontend/alpine/chat-settings/gm-config-tuning.ts`) so both boundaries
 * enforce temperature 0–2 and positive-int maxTokens from one definition.
 * No new migration: the override rides the existing `gm_config` JSON column.
 * Online-chat caveat (enforced by the chat PUT route, not here):
 * `assistantTuning` is a GM-execution sub-key, so it only persists on draft
 * chats; online saves forward the presentation subset and drops it.
 */

import { clampAssistantMaxTokens, clampAssistantTemperature, } from "../frontend/alpine/chat-settings/gm-config-tuning";
import { safeJsonParse, } from "../utils";

/** Validated per-chat override; null = no override on that axis. */
export interface AssistantTuningOverride {
  temperature: number | null;
  maxTokens: number | null;
}

/**
 * Parse and validate the `assistantTuning` sub-key out of a `chats.gm_config`
 * JSON string. Anything missing or malformed degrades to no override.
 * @param gmConfigJson Raw `gm_config` column value.
 */
export function parseAssistantTuning(gmConfigJson: string | null | undefined,): AssistantTuningOverride {
  if (!gmConfigJson) { return { temperature: null, maxTokens: null, }; }
  const parsed = safeJsonParse<Record<string, unknown>>(gmConfigJson,);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return { temperature: null, maxTokens: null, };
  }
  const raw = parsed.value.assistantTuning;
  if (raw == null || typeof raw !== "object") { return { temperature: null, maxTokens: null, }; }
  const rec = raw as Record<string, unknown>;
  return {
    temperature: clampAssistantTemperature(rec.temperature,),
    maxTokens: clampAssistantMaxTokens(rec.maxTokens,),
  };
}

/**
 * Resolve the effective temperature for provider params: explicit request
 * wins, then the chat override, then undefined (provider default).
 * @param explicit Request-level temperature, if any.
 * @param override Validated per-chat override, if any.
 */
export function resolveAssistantTemperature(
  explicit: number | undefined,
  override: number | null,
): number | undefined {
  return clampAssistantTemperature(explicit,) ?? override ?? undefined;
}

/**
 * Resolve the effective maxTokens for provider params (same precedence).
 * @param explicit Request-level maxTokens, if any.
 * @param override Validated per-chat override, if any.
 */
export function resolveAssistantMaxTokens(
  explicit: number | undefined,
  override: number | null,
): number | undefined {
  return clampAssistantMaxTokens(explicit,) ?? override ?? undefined;
}
