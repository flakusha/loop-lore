// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/templates-loader/validation-domains.ts — character and workflow
// domain validators (split from validation.ts; the exported validators are
// re-exported there so existing import paths keep working).

import { jsonStringifyOr, } from "../../utils";

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

const LEGAL_WORKFLOW_STEP_TYPES = ["text", "choice", "multi",] as const;

/**
 * Validate one workflow step entry.
 * @param entry
 * @param workflowId
 * @param index
 */
function validateWorkflowStepEntry(entry: unknown, workflowId: string, index: number,): void {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`workflows.${workflowId}.steps[${index}] must be an object`,);
  }
  const s = entry as Partial<{
    id: unknown;
    name: unknown;
    type: unknown;
    formatTemplate: unknown;
    options: unknown;
    recommendations: unknown;
  }>;
  if (typeof s.id !== "string" || s.id === "") {
    throw new TypeError(`workflows.${workflowId}.steps[${index}].id must be a non-empty string`,);
  }
  if (typeof s.name !== "string" || s.name === "") {
    throw new TypeError(`workflows.${workflowId}.steps[${index}].name must be a non-empty string`,);
  }
  if (typeof s.type !== "string" || !(LEGAL_WORKFLOW_STEP_TYPES as readonly string[]).includes(s.type,)) {
    throw new TypeError(
      `workflows.${workflowId}.steps[${index}].type must be one of ${LEGAL_WORKFLOW_STEP_TYPES.join("|",)}`,
    );
  }
  if (typeof s.formatTemplate !== "string" || s.formatTemplate === "") {
    throw new TypeError(`workflows.${workflowId}.steps[${index}].formatTemplate must be a non-empty string`,);
  }
  if ((s.type === "choice" || s.type === "multi") && !Array.isArray(s.options,)) {
    throw new TypeError(`workflows.${workflowId}.steps[${index}].options must be an array for choice/multi steps`,);
  }
  if (s.recommendations !== undefined && !Array.isArray(s.recommendations,)) {
    throw new TypeError(`workflows.${workflowId}.steps[${index}].recommendations must be an array`,);
  }
}

/**
 * Validate the `workflows` domain raw config before merging.
 * Accepts either `{ workflows: {...} }` (single-file domain shape) or a
 * bare `{ [id]: workflow }` map (multi-file workflows/*.yaml shape).
 * @param raw
 */
export function validateWorkflowConfig(raw: Record<string, unknown>,): void {
  const table = (
    raw.workflows !== undefined ? raw.workflows : raw
  ) as Record<string, unknown>;
  if (typeof table !== "object" || table === null || Array.isArray(table,)) {
    throw new Error("workflows must be an object mapping id -> workflow",);
  }
  for (const [id, value,] of Object.entries(table,)) {
    if (id === "merge") { continue; }
    if (typeof value !== "object" || value === null) {
      throw new Error(`workflows.${id} must be an object`,);
    }
    const w = value as Partial<{
      id: unknown;
      name: unknown;
      steps: unknown;
      dispatch: unknown;
      triggers: unknown;
      modelFamily: unknown;
    }>;
    if (w.id !== undefined && typeof w.id !== "string") {
      throw new TypeError(`workflows.${id}.id must be a string`,);
    }
    if (w.name !== undefined && typeof w.name !== "string") {
      throw new TypeError(`workflows.${id}.name must be a string`,);
    }
    if (w.steps !== undefined) {
      if (!Array.isArray(w.steps,)) {
        throw new Error(`workflows.${id}.steps must be an array`,);
      }
      w.steps.forEach((entry, i,) => {
        validateWorkflowStepEntry(entry, id, i,);
      },);
    }
    if (w.dispatch !== undefined && (typeof w.dispatch !== "object" || w.dispatch === null)) {
      throw new TypeError(`workflows.${id}.dispatch must be an object`,);
    }
    if (w.triggers !== undefined && !Array.isArray(w.triggers,)) {
      throw new TypeError(`workflows.${id}.triggers must be an array`,);
    }
    if (w.modelFamily !== undefined && typeof w.modelFamily !== "string") {
      throw new TypeError(`workflows.${id}.modelFamily must be a string`,);
    }
  }
}
