// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Classifier Prompt Resolver (consumer side)
 *
 * Assembles the layered tag query for one aux decision point and resolves
 * its system prompt. Precedence: user pack template (selected by task +
 * validated tags + priority) > `systemPrompts.<purpose>` single override >
 * code default. With no packs configured this is exactly
 * `resolveSystemPrompt` — the fast path performs no DB reads, so
 * unconfigured installs are behavior-identical.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { Config, } from "../config/schema";
import type { ClassTemplateParams, } from "../config/sections/templates";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts/registry";
import { safeJsonParse, } from "../utils";
import {
  type ClassTagInput,
  selectClassTemplate,
} from "./class-template-select";
import { AUX_CLASSIFICATION_TASKS, } from "./template-registry";
import type { AuxTaskName, } from "./types";

/** Result of the consumer-side prompt resolution. */
export interface ClassifierPrompt {
  /** System prompt: winning pack template or the resolved purpose default. */
  readonly prompt: string;
  /** Sampling overrides from the winning pack; undefined → registry defaults. */
  readonly params: ClassTemplateParams | undefined;
  /** Winning pack id, or null when the purpose default was used. */
  readonly packId: string | null;
}

/** Context for {@link resolveClassifierPrompt}. */
export interface ClassifierPromptContext {
  readonly config: Config;
  readonly db: Kysely<DB>;
  readonly task: AuxTaskName;
  readonly chatId?: string;
}

/** system_config key holding the admin-curated tag vocabulary (JSON string[]). */
export const CLASSIFIER_TAG_VOCABULARY_KEY = "classifier_tag_vocabulary";

/** system_config key prefix for the per-chat active tag subset (JSON string[]). */
export const CLASSIFIER_TAGS_ACTIVE_PREFIX = "classifier_tags_active:";

/**
 * Module logger for classifier prompt resolution.
 * @returns child logger tagged `module: "class-template-select"`
 */
function getLog() {
  return getLogger().child({ module: "class-template-select", },);
}

/**
 * Read a system_config key holding a JSON string array.
 * @param db - Kysely instance
 * @param key - config key
 * @returns the string array, or undefined when unset/malformed
 */
async function readStringArray(db: Kysely<DB>, key: string,): Promise<string[] | undefined> {
  const raw = await getConfigValue(db, key,);
  if (raw === undefined) { return undefined; }
  const parsed = safeJsonParse<unknown>(raw,);
  if (
    !parsed.ok || !Array.isArray(parsed.value,) ||
    !parsed.value.every((t,) => typeof t === "string")
  ) {
    getLog().warn("ignoring malformed classifier tag config", { key, },);
    return undefined;
  }

  return parsed.value;
}

/**
 * Collect the automatic actor-trait tags (read-only layer) of a chat's
 * participants from their `actors.settings` JSON `tags` arrays.
 * @param db - Kysely instance
 * @param chatId - chat to inspect
 * @returns actor-layer tags (deduplicated)
 */
async function collectActorTags(db: Kysely<DB>, chatId: string,): Promise<ClassTagInput[]> {
  const participants = await db
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  if (participants.length === 0) { return []; }

  const actors = await db
    .selectFrom("actors",)
    .select(["id", "settings",],)
    .where("id", "in", [...new Set(participants.map((p,) => p.actor_id),),],)
    .execute();

  const tags = new Map<string, ClassTagInput>();
  for (const actor of actors) {
    if (!actor.settings) { continue; }
    const parsed = safeJsonParse<{ tags?: unknown }>(actor.settings,);
    const list = parsed.ok && Array.isArray(parsed.value.tags,) ? parsed.value.tags : [];
    for (const tag of list) {
      if (typeof tag === "string" && !tags.has(tag,)) {
        tags.set(tag, { tag, layer: "actor", },);
      }
    }
  }

  return [...tags.values(),];
}

/**
 * Resolve the classifier system prompt for a decision point.
 * @param ctx - config, db, task and optional chat context
 * @returns The prompt plus the winning pack's sampling params (when selected)
 */
export async function resolveClassifierPrompt(
  ctx: ClassifierPromptContext,
): Promise<ClassifierPrompt> {
  const def = AUX_CLASSIFICATION_TASKS[ctx.task];
  // `templates?.` keeps minimal Config stubs (and degraded loads) on the
  // legacy path: resolveSystemPrompt treats undefined templates the same way.
  const packs = ctx.config.templates?.classifiers;
  const fallback = (): ClassifierPrompt => ({
    prompt: def.purpose === null
      ? ""
      : resolveSystemPrompt(ctx.config.templates?.llm, def.purpose,),
    params: undefined,
    packId: null,
  });

  if (packs === undefined || Object.keys(packs.classifiers,).length === 0) { return fallback(); }

  const vocabulary = await readStringArray(ctx.db, CLASSIFIER_TAG_VOCABULARY_KEY,);
  const chatTags = ctx.chatId === undefined
    ? undefined
    : await readStringArray(ctx.db, `${CLASSIFIER_TAGS_ACTIVE_PREFIX}${ctx.chatId}`,);

  const actorTags = ctx.chatId === undefined ? [] : await collectActorTags(ctx.db, ctx.chatId,);

  const selected = selectClassTemplate(packs, {
    task: ctx.task,
    tags: [
      ...(chatTags ?? []).map((tag,) => ({ tag, layer: "chat" as const, })),
      ...actorTags,
    ],
    vocabulary,
  },);

  if (!selected) { return fallback(); }
  return {
    prompt: selected.template.template,
    params: selected.template.params,
    packId: selected.template.id,
  };
}
