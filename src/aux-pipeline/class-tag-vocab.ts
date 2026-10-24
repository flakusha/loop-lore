// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Classifier tag vocabulary — validation and persistence helpers shared by
 * the admin system-config PATCH validation and the per-chat active-subset
 * routes. The vocabulary lives in system_config under
 * `classifier_tag_vocabulary` (JSON `string[]`); a chat's active subset
 * lives under `classifier_tags_active:<chatId>` (same shape).
 */
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import {
  CLASSIFIER_TAG_VOCABULARY_KEY,
  CLASSIFIER_TAGS_ACTIVE_PREFIX,
  MAX_TAG_LENGTH,
  MAX_VOCABULARY_TAGS,
} from "./class-tag-vocab-constants";

export {
  CLASSIFIER_TAG_VOCABULARY_KEY,
  CLASSIFIER_TAGS_ACTIVE_PREFIX,
  MAX_TAG_LENGTH,
  MAX_VOCABULARY_TAGS,
} from "./class-tag-vocab-constants";

/** Result of vocabulary validation. */
export type TagVocabularyResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

/**
 * Validate a candidate vocabulary value (usually the parsed JSON of the
 * config value): an array of unique, non-empty, trimmed strings within the
 * length/count caps.
 * @param value - unknown candidate (usually JSON.parse of a config value)
 * @returns the trimmed, order-preserving tag list, or a validation error
 */
export function validateTagVocabulary(value: unknown,): TagVocabularyResult {
  if (!Array.isArray(value,)) {
    return { ok: false, error: "classifier_tag_vocabulary must be a JSON array of strings", };
  }

  if (value.length > MAX_VOCABULARY_TAGS) {
    return { ok: false, error: `classifier_tag_vocabulary holds at most ${MAX_VOCABULARY_TAGS} tags`, };
  }

  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, error: "classifier_tag_vocabulary entries must be strings", };
    }

    const tag = entry.trim();
    if (tag.length === 0) {
      return { ok: false, error: "classifier_tag_vocabulary entries must be non-empty", };
    }

    if (tag.length > MAX_TAG_LENGTH) {
      return {
        ok: false,
        error: `classifier_tag_vocabulary entries must be at most ${MAX_TAG_LENGTH} characters`,
      };
    }

    if (seen.has(tag,)) {
      return { ok: false, error: `classifier_tag_vocabulary entries must be unique (duplicate: ${tag})`, };
    }

    seen.add(tag,);
  }

  return { ok: true, tags: value.map((t,) => (t as string).trim()), };
}

/**
 * Filter a proposed active-subset down to entries that are in the current
 * vocabulary, preserving order and dropping duplicates.
 * @param active - proposed active tags
 * @param vocabulary - the curated vocabulary (ground truth)
 * @returns the vocabulary-restricted subset
 */
export function filterActiveSubset(active: string[], vocabulary: string[],): string[] {
  const allowed = new Set(vocabulary,);
  const kept = new Set<string>();
  for (const tag of active) {
    if (allowed.has(tag,) && !kept.has(tag,)) { kept.add(tag,); }
  }

  return [...kept,];
}

/**
 * Read the system_config key holding a chat's active tag subset.
 * @param chatId - chat whose subset key is derived
 * @returns `classifier_tags_active:<chatId>`
 */
export function activeTagsKey(chatId: string,): string {
  return `${CLASSIFIER_TAGS_ACTIVE_PREFIX}${chatId}`;
}

/**
 * Read the curated vocabulary from system_config.
 * @param db - Kysely instance
 * @returns the tag list; empty when the key is unset or malformed
 */
export async function readTagVocabulary(db: Kysely<DB>,): Promise<string[]> {
  const raw = await getConfigValue(db, CLASSIFIER_TAG_VOCABULARY_KEY,);
  if (raw === undefined) { return []; }
  const parsed = safeJsonParse<unknown>(raw,);
  if (!parsed.ok) { return []; }
  const result = validateTagVocabulary(parsed.value,);
  return result.ok ? result.tags : [];
}

/**
 * Persist the curated vocabulary (validated) into system_config.
 * @param db - Kysely instance
 * @param tags - validated tag list
 */
export async function writeTagVocabulary(db: Kysely<DB>, tags: string[],): Promise<void> {
  await setConfig(
    db,
    CLASSIFIER_TAG_VOCABULARY_KEY,
    jsonStringifyOr(tags,),
    "Classifier tag vocabulary (admin-curated)",
  );
}

/**
 * Read a chat's active tag subset from system_config.
 * @param db - Kysely instance
 * @param chatId - chat whose subset is read
 * @returns the active subset; empty when unset or malformed
 */
export async function readActiveTags(db: Kysely<DB>, chatId: string,): Promise<string[]> {
  const raw = await getConfigValue(db, activeTagsKey(chatId,),);
  if (raw === undefined) { return []; }
  const parsed = safeJsonParse<unknown>(raw,);
  if (!parsed.ok || !Array.isArray(parsed.value,)) { return []; }
  return parsed.value.filter((t,): t is string => typeof t === "string");
}

/**
 * Persist a chat's active tag subset (already vocabulary-filtered).
 * @param db - Kysely instance
 * @param chatId - chat whose subset is written
 * @param tags - the active subset
 */
export async function writeActiveTags(db: Kysely<DB>, chatId: string, tags: string[],): Promise<void> {
  await setConfig(db, activeTagsKey(chatId,), jsonStringifyOr(tags,), "Per-chat active classifier tag subset",);
}
