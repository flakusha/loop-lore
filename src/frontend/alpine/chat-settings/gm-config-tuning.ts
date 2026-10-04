// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-settings assistant-tuning section.
 *
 * Per-chat assistant override (temperature/maxTokens) split from
 * `gm-config.ts` to keep it under the file-size guard.
 */

import type { GmConfig, } from "../types";

/**
 * TUNING_CHANNEL_NOTE — where per-chat assistant tuning lives and why.
 *
 * Channel: the existing `gm_config` JSON column (`assistantTuning` sub-key),
 * persisted through the chat PUT `gmConfig` payload — no new migration, no new
 * column. Backend consumption: the manual route
 * (`src/generation/generate-route/resolve-options.ts`) resolves the override into the
 * generate options (`parseAssistantTuning` + `resolveAssistant*`), and the
 * regular auto-gen path (`src/generation/auto-gen/call-llm.ts`) resolves it
 * via `resolveAutoGenSamplingParams` — a per-chat override beats both the
 * auto-gen defaults (0.9 / 2048) and the short-reply heuristic (512).
 * The override also round-trips through `gm_config` and is validated at this
 * boundary. Floor guaranteed regardless: every chat —
 * even one whose stored blob predates tuning — renders effective values via
 * `effectiveAssistantParams` below.
 *
 * Online-chat caveat: `assistantTuning` is a GM-execution sub-key, so the
 * backend 409s it on online chats (see `GM_CONFIG_PRESENTATION_KEYS`). Draft
 * chats persist it; online saves forward only the presentation subset, which
 * drops the key without error until the backend allowlists it.
 */

/** Server-side generation defaults mirrored for the effective-params display. */
export const ASSISTANT_TUNING_DEFAULTS = { temperature: 0.9, maxTokens: 2048, } as const;

/** Persisted shape of the per-chat assistant override inside `gm_config`. */
export interface AssistantTuning {
  temperature: number | null;
  maxTokens: number | null;
}

/**
 * Clamp a candidate temperature to the valid range. Returns null for anything
 * outside 0–2 (the boundary validation for the tuning override).
 * @param value
 * @returns {number | null}
 */
export function clampAssistantTemperature(value: unknown,): number | null {
  if (typeof value !== "number" || !Number.isFinite(value,)) { return null; }
  if (value < 0 || value > 2) { return null; }
  return value;
}

/**
 * Clamp a candidate max-tokens to a positive int, else null (boundary check).
 * @param value
 * @returns {number | null}
 */
export function clampAssistantMaxTokens(value: unknown,): number | null {
  if (typeof value !== "number" || !Number.isFinite(value,)) { return null; }
  if (!Number.isInteger(value,) || value <= 0) { return null; }
  return value;
}

/**
 * Read the validated assistant tuning out of a persisted gm_config blob.
 * Unknown/invalid shapes degrade to nulls (no override).
 * @param config
 * @returns {AssistantTuning}
 */
export function readAssistantTuning(config: GmConfig,): AssistantTuning {
  const raw = (config as GmConfig & { assistantTuning?: unknown }).assistantTuning;
  if (raw == null || typeof raw !== "object") { return { temperature: null, maxTokens: null, }; }
  const rec = raw as Record<string, unknown>;
  return {
    temperature: clampAssistantTemperature(rec.temperature,),
    maxTokens: clampAssistantMaxTokens(rec.maxTokens,),
  };
}

/**
 * Resolve the effective generation params: override wins, otherwise the
 * server defaults. Used for the read-only effective-params display floor.
 * @param tuning
 * @returns {{ temperature: number; maxTokens: number; }}
 */
export function effectiveAssistantParams(tuning: AssistantTuning,): { temperature: number; maxTokens: number } {
  return {
    temperature: tuning.temperature ?? ASSISTANT_TUNING_DEFAULTS.temperature,
    maxTokens: tuning.maxTokens ?? ASSISTANT_TUNING_DEFAULTS.maxTokens,
  };
}
