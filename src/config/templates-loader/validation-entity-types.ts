// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  ENTITY_QUALITY_GATES,
  type WorkflowTemplateConfig,
} from "../sections/templates-workflow";

const LEGAL_ENTITY_GATES: readonly string[] = ENTITY_QUALITY_GATES;

/** Validate the raw entityTypes domain (workflows/entity-types.yaml). */
export function validateEntityTypeConfig(raw: Record<string, unknown>,): void {
  const table = (
    raw.entityTypes !== undefined ? raw.entityTypes : raw
  ) as Record<string, unknown>;
  if (typeof table !== "object" || table === null || Array.isArray(table,)) {
    throw new Error("entityTypes must be an object mapping kind -> preset",);
  }
  for (const [kind, value,] of Object.entries(table,)) {
    if (kind === "merge") { continue; }
    validateEntityTypePresetEntry(kind, value,);
  }
}

function validateEntityTypePresetEntry(kind: string, value: unknown,): void {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    throw new Error(`entityTypes.${kind} must be an object`,);
  }
  const p = value as Partial<{
    workflowId: unknown;
    requiredSteps: unknown;
    qualityGates: unknown;
    dispatchTarget: unknown;
  }>;
  if (typeof p.workflowId !== "string" || p.workflowId === "") {
    throw new TypeError(`entityTypes.${kind}.workflowId must be a non-empty string`,);
  }
  if (typeof p.dispatchTarget !== "string" || p.dispatchTarget === "") {
    throw new TypeError(`entityTypes.${kind}.dispatchTarget must be a non-empty string`,);
  }
  if (!Array.isArray(p.requiredSteps,) || p.requiredSteps.some((s,) => typeof s !== "string")) {
    throw new TypeError(`entityTypes.${kind}.requiredSteps must be an array of strings`,);
  }
  if (!Array.isArray(p.qualityGates,)) {
    throw new TypeError(`entityTypes.${kind}.qualityGates must be an array`,);
  }
  for (const gate of p.qualityGates) {
    if (!LEGAL_ENTITY_GATES.includes(String(gate,),)) {
      throw new TypeError(
        `entityTypes.${kind}.qualityGates entries must be one of ${ENTITY_QUALITY_GATES.join("|",)}`,
      );
    }
  }
}

/** Cross-validate merged entity-type presets against merged workflows. */
export function validateEntityTypePresets(config: WorkflowTemplateConfig,): void {
  for (const [kind, preset,] of Object.entries(config.entityTypes,)) {
    const workflow = config.workflows[preset.workflowId];
    if (!workflow) {
      throw new Error(
        `entityTypes.${kind}.workflowId '${preset.workflowId}' does not match any loaded workflow`,
      );
    }
    for (const stepId of preset.requiredSteps) {
      const step = workflow.steps.find((s,) => s.id === stepId);
      if (!step) {
        throw new Error(
          `entityTypes.${kind}.requiredSteps references '${stepId}', which is not a step of workflow '${preset.workflowId}'`,
        );
      }
      if (step.required === false) {
        throw new Error(
          `entityTypes.${kind}.requiredSteps requires step '${stepId}', but workflow '${preset.workflowId}' marks it required: false`,
        );
      }
    }
  }
}
