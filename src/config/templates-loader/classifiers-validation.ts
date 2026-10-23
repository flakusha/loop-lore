// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/templates-loader/classifiers-validation.ts — classifier
// template-pack load-time validation (hand-rolled throwers matching
// validation.ts conventions) + Levenshtein typo warnings against the
// AuxTaskName union.

import { AUX_CLASSIFICATION_TASKS, } from "../../aux-pipeline/template-registry";
import type { AuxTaskName, } from "../../aux-pipeline/types";
import { ChatMode, } from "../../db/enums-core/users";
import { jsonStringifyOr, } from "../../utils";
import type { MergeStrategy, } from "../sections/templates";

const LEGAL_MERGE_STRATEGIES: readonly MergeStrategy[] = [
  "replace",
  "extend",
  "override",
];

const LEGAL_CHAT_MODES: readonly string[] = Object.values(ChatMode,);

/**
 * Validate one classifier template-pack entry before merging.
 * @param id - pack id under the `classifiers` map
 * @param value - raw parsed entry
 * @throws {Error|TypeError} On any malformed field or unknown serve target
 */
function validateClassTemplateEntry(id: string, value: unknown,): void {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    throw new Error(`classifiers.${id} must be an object`,);
  }

  const p = value as Record<string, unknown>;
  for (const field of ["id", "name", "template",] as const) {
    if (typeof p[field] !== "string" || (p[field] as string).length === 0) {
      throw new Error(`classifiers.${id}.${field} must be a non-empty string`,);
    }
  }

  if (p.description !== undefined && typeof p.description !== "string") {
    throw new TypeError(`classifiers.${id}.description must be a string`,);
  }

  if (!Array.isArray(p.serves,) || p.serves.length === 0) {
    throw new Error(`classifiers.${id}.serves must be a non-empty array of AuxTaskNames`,);
  }

  for (const serve of p.serves) {
    if (typeof serve !== "string") {
      throw new TypeError(`classifiers.${id}.serves entries must be strings`,);
    }

    if (!(serve in AUX_CLASSIFICATION_TASKS)) {
      throw new Error(
        `classifiers.${id}.serves."${serve}" is not a known AuxTaskName ` +
          `(expected one of ${Object.keys(AUX_CLASSIFICATION_TASKS,).join("|",)},)`,
      );
    }
  }

  if (!Array.isArray(p.tags,)) {
    throw new TypeError(`classifiers.${id}.tags must be an array of strings`,);
  }

  for (const tag of p.tags) {
    if (typeof tag !== "string") {
      throw new TypeError(`classifiers.${id}.tags entries must be strings`,);
    }
  }

  if (p.when !== undefined) {
    validateClassTemplateWhen(p.when, id,);
  }

  if (p.priority !== undefined && typeof p.priority !== "number") {
    throw new TypeError(`classifiers.${id}.priority must be a number`,);
  }

  if (p.params !== undefined) {
    if (typeof p.params !== "object" || p.params === null || Array.isArray(p.params,)) {
      throw new TypeError(`classifiers.${id}.params must be an object`,);
    }

    for (const key of ["timeoutMs", "temperature", "maxTokens",] as const) {
      const params = p.params as Record<string, unknown>;
      const v = params[key];
      if (v !== undefined && typeof v !== "number") {
        throw new TypeError(`classifiers.${id}.params.${key} must be a number`,);
      }
    }
  }

  if (p.labels !== undefined) {
    if (!Array.isArray(p.labels,)) {
      throw new TypeError(`classifiers.${id}.labels must be an array of strings`,);
    }

    for (const label of p.labels) {
      if (typeof label !== "string") {
        throw new TypeError(`classifiers.${id}.labels entries must be strings`,);
      }
    }
  }
}

/**
 * Validate the `when` guard block on one pack.
 * @param when - raw `when` value
 * @param id - pack id for error messages
 * @throws {TypeError} On a non-object block or malformed chatMode guard
 */
function validateClassTemplateWhen(when: unknown, id: string,): void {
  if (typeof when !== "object" || when === null || Array.isArray(when,)) {
    throw new TypeError(`classifiers.${id}.when must be an object`,);
  }

  const w = when as { chatMode?: unknown };
  if (w.chatMode === undefined) { return; }
  if (!Array.isArray(w.chatMode,) || w.chatMode.length === 0) {
    throw new TypeError(`classifiers.${id}.when.chatMode must be a non-empty array`,);
  }

  for (const mode of w.chatMode) {
    if (typeof mode !== "string" || !LEGAL_CHAT_MODES.includes(mode,)) {
      throw new TypeError(
        `classifiers.${id}.when.chatMode entries must be one of ${LEGAL_CHAT_MODES.join("|",)}, ` +
          `got ${jsonStringifyOr(mode, "undefined",)}`,
      );
    }
  }
}

/**
 * Validate the `classifiers` domain raw config before merging.
 * Accepts either `{ classifiers: {...} }` or a bare `{ [id]: pack }` map
 * (multi-file classifiers/*.yaml shape), like validateWorkflowConfig.
 * @param raw
 * @throws {Error} If the classifiers domain config is invalid.
 */
export function validateClassifiersConfig(raw: Record<string, unknown>,): void {
  if (
    raw.merge !== undefined && (
      typeof raw.merge !== "string" ||
      !LEGAL_MERGE_STRATEGIES.includes(raw.merge as MergeStrategy,)
    )
  ) {
    throw new Error(
      `merge must be one of ${LEGAL_MERGE_STRATEGIES.join("|",)}, got ${jsonStringifyOr(raw.merge, "undefined",)}`,
    );
  }

  const table = (
    raw.classifiers !== undefined ? raw.classifiers : raw
  ) as Record<string, unknown>;

  if (typeof table !== "object" || table === null || Array.isArray(table,)) {
    throw new Error("classifiers must be an object mapping id -> pack",);
  }

  for (const [id, value,] of Object.entries(table,)) {
    if (id === "merge") { continue; }
    validateClassTemplateEntry(id, value,);
  }
}

/**
 * Warn when a `serves` entry is not a known AuxTaskName but is within edit
 * distance 2 of one — catches typos like "transiton" that would otherwise
 * throw with a long enum list. Runs AFTER validateClassifiersConfig, so it
 * only ever sees entries the strict check already accepted as strings.
 * @param raw - raw classifiers domain config
 */
export function warnUnknownClassifierServes(raw: Record<string, unknown>,): void {
  const table = (
    raw.classifiers !== undefined ? raw.classifiers : raw
  ) as Record<string, unknown>;

  if (typeof table !== "object" || table === null) { return; }

  for (const [id, value,] of Object.entries(table,)) {
    if (typeof value !== "object" || value === null) { continue; }
    const serves = (value as { serves?: unknown }).serves;
    if (!Array.isArray(serves,)) { continue; }
    for (const serve of serves) {
      if (typeof serve !== "string" || serve in AUX_CLASSIFICATION_TASKS) { continue; }
      const near = (Object.keys(AUX_CLASSIFICATION_TASKS,) as AuxTaskName[]).find(
        (task,) => levenshtein(serve, task,) <= 2,
      );

      if (near !== undefined) {
        process.emitWarning(
          `classifiers.${id}.serves."${serve}" is not a known AuxTaskName — did you mean "${near}"?`,
          "TemplateConfigWarning",
        );
      }
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
