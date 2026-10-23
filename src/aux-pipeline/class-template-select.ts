// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Classifier Template-Pack Selection
 *
 * Selection side of the layered tag authority (epic-classifier-template-packs):
 * - the ADMIN layer curates the tag vocabulary (system_config key
 *   `classifier_tag_vocabulary`, JSON string[]); query tags outside it are
 *   dropped, so packs stay inert until the vocabulary exists;
 * - the CHAT layer contributes the chat-active subset (system_config key
 *   `classifier_tags_active:<chatId>`, JSON string[]);
 * - the ACTOR layer contributes automatic, read-only trait tags from the
 *   chat participants' `actors.settings` JSON `tags` arrays (it can enable
 *   packs, never restrict them).
 *
 * `selectClassTemplate` ranks candidates (serves ∩ task, `when` guards,
 * pack tags ⊆ query tags) and reports which layer supplied every matched
 * tag. No packs configured → callers fall through to
 * `resolveSystemPrompt` unchanged (back-compat).
 *
 * The consumer-facing resolver (`resolveClassifierPrompt`, tag assembly,
 * vocabulary reads) lives in `class-template-resolver.ts`.
 */
import type { ClassTemplateConfig, } from "../config/sections/templates";
import { getLogger, } from "../logger";
import type { AuxTaskName, } from "./types";

/** Layer that supplied a selection tag. */
export type ClassTagLayer = "chat" | "actor";

/** One query tag with its supplying layer. */
export interface ClassTagInput {
  readonly tag: string;
  readonly layer: ClassTagLayer;
}

/** Query for {@link selectClassTemplate}. */
export interface ClassTemplateQuery {
  /** Which decision point is asking. */
  readonly task: AuxTaskName;
  /** Chat-active ∪ actor-trait tags, with layer provenance. */
  readonly tags: readonly ClassTagInput[];
  /** Chat mode, evaluated against `when.chatMode` guards. */
  readonly chatMode?: string;
  /** Admin-curated vocabulary; tags outside it are dropped (empty = inert). */
  readonly vocabulary?: readonly string[];
}

/** A winning template plus per-tag layer provenance. */
export interface SelectedClassTemplate {
  readonly template: ClassTemplateConfig;
  /** Matched pack tags → the layers that supplied each. */
  readonly matchedTags: readonly { tag: string; layers: ClassTagLayer[] }[];
}

/** Priority-descending per-task candidate list, stable within a priority. */
export interface ClassTemplateIndex {
  byTask(task: AuxTaskName,): readonly ClassTemplateConfig[];
}

/**
 * Module logger for classifier pack selection.
 * @returns child logger tagged `module: "class-template-select"`
 */
function getLog() {
  return getLogger().child({ module: "class-template-select", },);
}

/**
 * Index packs by served task, priority-descending, stable by file order.
 * @param templates - the `classifiers` template section
 * @returns index over packs that declare a non-empty template
 */
export function buildClassTemplateIndex(
  templates: { classifiers: Record<string, ClassTemplateConfig> },
): ClassTemplateIndex {
  const byTask = new Map<AuxTaskName, ClassTemplateConfig[]>();
  for (const pack of Object.values(templates.classifiers,)) {
    if (!pack.template) { continue; }
    for (const task of pack.serves) {
      const list = byTask.get(task,) ?? [];
      list.push(pack,);
      byTask.set(task, list,);
    }
  }

  for (const [task, list,] of byTask) {
    // Stable sort: equal priorities keep their file/insertion order.
    byTask.set(task, [...list,].sort((a, b,) => (b.priority ?? 0) - (a.priority ?? 0)),);
  }

  return { byTask: (task,) => byTask.get(task,) ?? [], };
}

/**
 * Drop query tags outside the admin vocabulary.
 * @param tags - query tags with layers
 * @param vocabulary - admin-curated tag list; empty/undefined drops everything
 * @returns the surviving tags
 */
function validateQueryTags(
  tags: readonly ClassTagInput[],
  vocabulary: readonly string[] | undefined,
): ClassTagInput[] {
  if (vocabulary === undefined || vocabulary.length === 0) { return []; }
  return tags.filter((t,) => vocabulary.includes(t.tag,));
}

/**
 * Select the winning classifier template for a query.
 * Match rule: `serves` includes the task AND every `when` guard holds AND
 * pack tags ⊆ (validated) query tags; highest priority wins, ties break by
 * file order. Selection (including layer provenance) is logged.
 * @param templates - the `classifiers` template section
 * @param query - task, query tags, optional chat mode + vocabulary
 * @returns The winning template, or null → caller falls through to the
 *   purpose default (`resolveSystemPrompt`).
 */
export function selectClassTemplate(
  templates: { classifiers: Record<string, ClassTemplateConfig> },
  query: ClassTemplateQuery,
): SelectedClassTemplate | null {
  const queryTags = validateQueryTags(query.tags, query.vocabulary,);
  const tagLayers = new Map<string, ClassTagLayer[]>();
  for (const { tag, layer, } of queryTags) {
    const layers = tagLayers.get(tag,) ?? [];
    layers.push(layer,);
    tagLayers.set(tag, layers,);
  }

  const candidates = buildClassTemplateIndex(templates,).byTask(query.task,);
  let winner: ClassTemplateConfig | null = null;
  let matched: string[] = [];
  for (const pack of candidates) {
    // Every pack tag must appear among the (validated) query tags.
    const missing = pack.tags.filter((t,) => !tagLayers.has(t,));
    if (missing.length > 0) { continue; }

    const guard = pack.when?.chatMode;
    if (guard !== undefined && (query.chatMode === undefined || !guard.includes(query.chatMode as never,))) {
      continue;
    }

    winner = pack;
    matched = [...pack.tags,];
    break; // priority-desc order → first match wins
  }

  if (!winner) { return null; }

  const provenance = matched.map((tag,) => ({ tag, layers: tagLayers.get(tag,) ?? [], }));
  getLog().info("classifier pack selected", {
    task: query.task,
    packId: winner.id,
    chatMode: query.chatMode ?? null,
    matchedTags: provenance,
  },);

  return { template: winner, matchedTags: provenance, };
}
