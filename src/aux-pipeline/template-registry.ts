// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Classification Task Registry
 *
 * One declarative descriptor per 0-shot classification / aux decision point,
 * keyed by `AuxTaskName`. Single source for:
 * - which prompt purpose resolves the default system prompt,
 * - whether the task prefers a configured classifier model (the former
 *   `CLASSIFIER_TASKS` set in runner.ts),
 * - the declared output label vocabulary (documentation + parse hints),
 * - per-task call overrides applied by `callAux` when the caller omits them.
 *
 * `Record<AuxTaskName, …>` is deliberate: a new `AuxTaskName` is a compile
 * error here until it gets a descriptor.
 */
import type { PromptPurpose, } from "../prompts/purposes";
import type { AuxTaskName, } from "./types";

/** Sampling/timeout overrides a task pins for its aux calls. */
export interface ClassificationCallOverrides {
  /** Per-call timeout in ms; undefined → `callAux` default (2000). */
  readonly timeoutMs?: number;
  /** Temperature; undefined → `callAux` default (0.0). */
  readonly temperature?: number;
  /** Max output tokens; undefined → `callAux` default (100). */
  readonly maxTokens?: number;
}

/** Declarative descriptor for one aux classification decision point. */
export interface ClassificationTaskDef {
  /** Decision-point id; keys the template-selection index. */
  readonly task: AuxTaskName;
  /**
   * Prompt-purpose key into `LLM_PROMPT_DEFAULTS` / `systemPrompts.<purpose>`.
   * `null` for tasks without a single fixed default: `prompt-improve` builds
   * its prompt per level (`promptImproveSystemPrompt`), and `message-action`
   * has no production caller yet (recorded dead slot).
   */
  readonly purpose: PromptPurpose | null;
  /** Declared output label vocabulary (documentation + parse validation hint). */
  readonly labels: readonly string[];
  /** Prefer the classifier model role, falling back to auxiliary. */
  readonly preferClassifier: boolean;
  /** Runner overrides applied when the caller does not pass explicit values. */
  readonly call: ClassificationCallOverrides;
}

/**
 * Factory keeping descriptor construction uniform (options-object convention).
 * @param def - the descriptor literal
 * @returns the same descriptor, typed as {@link ClassificationTaskDef}
 */
export function defineClassificationTask(
  def: ClassificationTaskDef,
): ClassificationTaskDef {
  return def;
}

/** Every aux decision point, keyed by task name. */
export const AUX_CLASSIFICATION_TASKS: Readonly<Record<AuxTaskName, ClassificationTaskDef>> = {
  adapt: defineClassificationTask({
    task: "adapt",
    // /adapt builds its system prompt inline (buildAdaptationPrompt) and
    // dispatches directly — no fixed default prompt to resolve.
    purpose: null,
    labels: [],
    preferClassifier: false,
    // Never routed through callAux; these document the command's direct
    // dispatch sampling and exec-log classification.
    call: { maxTokens: 512, temperature: 0.7, },
  },),
  "immersion-audit": defineClassificationTask({
    // Opt-in (default OFF) prose-level audit of the immersion gate's
    // deterministic verdict. The label vocabulary EXCLUDES hard-block: the
    // classifier may only downgrade severity, never upgrade (epic truth).
    task: "immersion-audit",
    purpose: null, // caller-built messages (actor claim + state snapshot context)
    labels: ["allow", "annotate", "soft-refuse",],
    preferClassifier: true,
    // Deterministic severity verdicts; one short label.
    call: { temperature: 0, maxTokens: 20, },
  },),
};
