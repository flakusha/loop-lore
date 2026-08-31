// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { PROMPT_PURPOSES, } from "../../prompts/purposes";
import { jsonStringifyOr, } from "../../utils";
import type { ChatFormatTemplate, MergeStrategy, } from "../sections/templates";

// ── Validation ────────────────────────────────────────────────

const LEGAL_MERGE_STRATEGIES: readonly MergeStrategy[] = [
  "replace",
  "extend",
  "override",
];

/**
 * Runtime-validate a raw template config (from YAML/TOML) before merging,
 * so malformed files fail fast with an actionable error instead of silently
 * casting into a half-shaped config. Currently scoped to the `llm` domain.
 * @param raw - Parsed top-level object from the template file
 * @returns The llm sub-object, or null when the file is a different domain
 * @throws When the file declares `merge` legally but `systemPrompts` /
 *   `chatFormats` shapes are malformed
 */
export function validateLlmConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const llm = raw;
  if (!("systemPrompts" in llm) && !("chatFormats" in llm) && !("merge" in llm)) {
    return null;
  }

  if (
    llm.merge !== undefined && (
      typeof llm.merge !== "string" ||
      !LEGAL_MERGE_STRATEGIES.includes(llm.merge as MergeStrategy,)
    )
  ) {
    throw new Error(
      `merge must be one of ${LEGAL_MERGE_STRATEGIES.join("|",)}, got ${jsonStringifyOr(llm.merge, "undefined",)}`,
    );
  }

  validateSystemPrompts(llm.systemPrompts,);
  validateChatFormats(llm.chatFormats,);

  return llm;
}

/**
 * Validate the `systemPrompts` map (purpose -> string).
 * @param systemPrompts
 */
function validateSystemPrompts(systemPrompts: unknown,): void {
  if (systemPrompts === undefined) { return; }
  if (typeof systemPrompts !== "object" || systemPrompts === null) {
    throw new Error("systemPrompts must be an object mapping purpose -> string",);
  }
  for (const [purpose, value,] of Object.entries(systemPrompts as Record<string, unknown>,)) {
    if (typeof value !== "string") {
      throw new TypeError(`systemPrompts.${purpose} must be a string, got ${typeof value}`,);
    }
  }
}

/**
 * Validate the `chatFormats` map (name -> {system,user,assistant}).
 * @param chatFormats
 */
function validateChatFormats(chatFormats: unknown,): void {
  if (chatFormats === undefined) { return; }
  if (typeof chatFormats !== "object" || chatFormats === null) {
    throw new Error("chatFormats must be an object mapping name -> {system,user,assistant}",);
  }
  for (const [name, value,] of Object.entries(chatFormats as Record<string, unknown>,)) {
    if (typeof value !== "object" || value === null) {
      throw new Error(`chatFormats.${name} must be an object`,);
    }
    const fmt = value as Partial<ChatFormatTemplate>;
    for (const role of ["system", "user", "assistant",] as const) {
      if (typeof fmt[role] !== "string") {
        throw new TypeError(`chatFormats.${name}.${role} must be a string`,);
      }
    }
  }
}

// ── Non-LLM Domain Validation ────────────────────────────────
//
// The remaining domains (sd, avatar, imageEdit, character) previously had no
// load-time validation — malformed files surfaced as runtime errors far from
// the offending config. These validators enforce the minimum shape each merge
// function assumes; deep semantic checks stay with the domain consumers.

/**
 * Validate the `sd` domain raw config before merging.
 * @param raw
 */
export function validateSdConfig(raw: Record<string, unknown>,): void {
  if (raw.profiles !== undefined) {
    if (typeof raw.profiles !== "object" || raw.profiles === null || Array.isArray(raw.profiles,)) {
      throw new Error("profiles must be an object mapping profileId -> profile",);
    }
    for (const [id, value,] of Object.entries(raw.profiles as Record<string, unknown>,)) {
      if (typeof value !== "object" || value === null) {
        throw new Error(`profiles.${id} must be an object`,);
      }
      const p = value as Partial<{ name: unknown; promptFormat: unknown; maxTokenHint: unknown; defaults: unknown }>;
      if (p.name !== undefined && typeof p.name !== "string") {
        throw new TypeError(`profiles.${id}.name must be a string`,);
      }
      if (p.promptFormat !== undefined && typeof p.promptFormat !== "string") {
        throw new TypeError(`profiles.${id}.promptFormat must be a string`,);
      }
      if (p.maxTokenHint !== undefined && typeof p.maxTokenHint !== "number") {
        throw new TypeError(`profiles.${id}.maxTokenHint must be a number`,);
      }
      if (p.defaults !== undefined && (typeof p.defaults !== "object" || p.defaults === null)) {
        throw new TypeError(`profiles.${id}.defaults must be an object`,);
      }
    }
  }
  if (raw.modelMatching !== undefined) {
    if (!Array.isArray(raw.modelMatching,)) {
      throw new Error("modelMatching must be an array of {pattern, profileId}",);
    }
    for (const [i, rule,] of raw.modelMatching.entries()) {
      const r = rule as Partial<{ pattern: unknown; profileId: unknown }>;
      if (typeof r.pattern !== "string" || typeof r.profileId !== "string") {
        throw new TypeError(`modelMatching[${i}] must have string pattern and profileId`,);
      }
    }
  }
}

/**
 * Validate the `avatar` domain raw config before merging.
 * @param raw
 */
export function validateAvatarConfig(raw: Record<string, unknown>,): void {
  if (raw.emotions !== undefined) {
    if (typeof raw.emotions !== "object" || raw.emotions === null || Array.isArray(raw.emotions,)) {
      throw new Error("emotions must be an object mapping emotion -> {asset, intent}",);
    }
    for (const [emotion, value,] of Object.entries(raw.emotions as Record<string, unknown>,)) {
      if (typeof value !== "object" || value === null) {
        throw new Error(`emotions.${emotion} must be an object with asset + intent`,);
      }
      const e = value as Partial<{ asset: unknown; intent: unknown }>;
      if (typeof e.asset !== "string") {
        throw new TypeError(`emotions.${emotion}.asset must be a string`,);
      }
      if (e.intent !== undefined && typeof e.intent !== "string") {
        throw new TypeError(`emotions.${emotion}.intent must be a string`,);
      }
    }
  }
  if (raw.intentPatterns !== undefined && !Array.isArray(raw.intentPatterns,)) {
    throw new Error("intentPatterns must be an array",);
  }
}

/**
 * Validate the `imageEdit` domain raw config before merging.
 * @param raw
 */
export function validateImageEditConfig(raw: Record<string, unknown>,): void {
  if (raw.workflows !== undefined) {
    if (typeof raw.workflows !== "object" || raw.workflows === null || Array.isArray(raw.workflows,)) {
      throw new Error("workflows must be an object mapping slug -> workflow",);
    }
    for (const [slug, value,] of Object.entries(raw.workflows as Record<string, unknown>,)) {
      if (typeof value !== "object" || value === null) {
        throw new Error(`workflows.${slug} must be an object`,);
      }
      const w = value as Partial<{ id: unknown; name: unknown; category: unknown; backend: unknown }>;
      for (const field of ["name", "category", "backend",] as const) {
        if (w[field] !== undefined && typeof w[field] !== "string") {
          throw new TypeError(`workflows.${slug}.${field} must be a string`,);
        }
      }
    }
  }
}

const LEGAL_CONTENT_RATINGS = ["sfw", "questionable", "explicit",] as const;

/**
 * Validate one character template entry.
 * @param entry
 * @param index
 */
function validateCharacterTemplateEntry(entry: unknown, index: number,): void {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`templates[${index}] must be an object`,);
  }
  const t = entry as Partial<{ name: unknown; description: unknown; content_rating: unknown }>;
  if (typeof t.name !== "string" || t.name === "") {
    throw new TypeError(`templates[${index}].name must be a non-empty string`,);
  }
  if (t.description !== undefined && typeof t.description !== "string") {
    throw new TypeError(`templates[${index}].description must be a string`,);
  }
  const rating = typeof t.content_rating === "string" ? t.content_rating : "";
  if (t.content_rating !== undefined && !(LEGAL_CONTENT_RATINGS as readonly string[]).includes(rating,)) {
    throw new TypeError(
      `templates[${index}].content_rating must be one of ${LEGAL_CONTENT_RATINGS.join("|",)}, got ${
        jsonStringifyOr(t.content_rating, "undefined",)
      }`,
    );
  }
}

/**
 * Validate the `character` domain raw config before merging.
 * @param raw
 */
export function validateCharacterConfig(raw: Record<string, unknown>,): void {
  if (raw.templates !== undefined) {
    if (!Array.isArray(raw.templates,)) {
      throw new Error("templates must be an array of character template objects",);
    }
    raw.templates.forEach((entry, i,) => {
      validateCharacterTemplateEntry(entry, i,);
    },);
  }
}

// ── Unknown-Purpose Typo Detection ───────────────────────────

/**
 * Warn when a `systemPrompts` key is not a known purpose but is within edit
 * distance 2 of one — catches typos like `sumarize` that would otherwise be
 * silently treated as custom prompts and never resolved.
 * Custom keys beyond distance 2 stay silent (they are legal).
 * @param systemPrompts
 */
export function warnUnknownPromptPurposes(systemPrompts: unknown,): void {
  if (typeof systemPrompts !== "object" || systemPrompts === null) { return; }
  for (const key of Object.keys(systemPrompts as Record<string, unknown>,)) {
    if ((PROMPT_PURPOSES as readonly string[]).includes(key,)) { continue; }
    const near = PROMPT_PURPOSES.find((purpose,) => levenshtein(key, purpose,) <= 2);
    if (near !== undefined) {
      process.emitWarning(
        `systemPrompts."${key}" is not a known purpose — did you mean "${near}"? Unknown keys are treated as custom prompts.`,
        "TemplateConfigWarning",
      );
    }
  }
}

/**
 * Small Levenshtein distance (iterative, single row).
 * @param a
 * @param b
 */
function levenshtein(a: string, b: string,): number {
  let prev: number[] = Array.from({ length: b.length + 1, }, (_, i,) => i,);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i,];
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] ?? 0;
      const left = curr[j - 1] ?? 0;
      const diag = prev[j - 1] ?? 0;
      curr[j] = Math.min(above + 1, left + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1),);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}
