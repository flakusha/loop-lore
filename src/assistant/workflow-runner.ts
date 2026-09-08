// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Assistant workflow runner (epic-assistant-creative-studio-workflows).
//
// Pure state machine for config-driven multi-step generation workflows:
// start -> preview -> step (validate + recommend per step) -> confirm ->
// dispatch payload. No I/O: the caller loads the template (loader), renders
// preview/confirmation (frontend), runs NSFW gates, and POSTs the dispatch
// payload to the target backend.

import type {
  AssistantWorkflowConfig,
  WorkflowStepConfig,
} from "../config/sections/templates";

/** Mutable progress of one workflow run */
export interface WorkflowRun {
  workflowId: string;
  /** Step id -> validated raw value (string for text/choice, string[] for multi) */
  values: Record<string, string | string[]>;
  confirmed: boolean;
}

/** One previewable step: title + description + recommendations */
export interface WorkflowStepPreview {
  id: string;
  name: string;
  description?: string;
  type: WorkflowStepConfig["type"];
  recommendations: string[];
  options?: string[];
}

/** Final dispatch envelope produced by confirmAndDispatch */
export interface WorkflowDispatch {
  backend: string;
  target: string;
  payload: Record<string, unknown>;
}

/**
 * Start a run for a workflow template.
 * @param workflow - Resolved workflow template
 * @returns Fresh run with no values and no confirmation
 */
export function startWorkflow(workflow: AssistantWorkflowConfig,): WorkflowRun {
  return { workflowId: workflow.id, values: {}, confirmed: false, };
}

/**
 * Preview step titles + descriptions + recommendations + options.
 * @param workflow - Resolved workflow template
 * @returns Ordered step previews
 */
export function previewSteps(workflow: AssistantWorkflowConfig,): WorkflowStepPreview[] {
  return workflow.steps.map((step,) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    type: step.type,
    recommendations: step.recommendations ?? [],
    options: step.options,
  }));
}

/**
 * Validate and record one step value.
 * @param workflow - Resolved workflow template
 * @param run - Current run (mutated in place)
 * @param stepId - Step to fill
 * @param value - Raw user input
 * @returns The same run for chaining
 * @throws When the step id is unknown or the value fails validation
 */
export function buildStep(
  workflow: AssistantWorkflowConfig,
  run: WorkflowRun,
  stepId: string,
  value: string | string[],
): WorkflowRun {
  const step = workflow.steps.find((s,) => s.id === stepId);
  if (step === undefined) {
    throw new Error(`unknown step "${stepId}" for workflow "${workflow.id}"`,);
  }
  run.values[stepId] = validateStepValue(workflow.id, step, value,);
  return run;
}

/**
 * Assemble the final prompt by applying each step's formatTemplate in order.
 * Unfilled steps are skipped.
 * @param workflow - Resolved workflow template
 * @param run - Current run
 * @returns Assembled prompt string
 */
export function assemblePrompt(workflow: AssistantWorkflowConfig, run: WorkflowRun,): string {
  const parts: string[] = [];
  for (const step of workflow.steps) {
    const value = run.values[step.id];
    if (value === undefined) { continue; }
    const rendered = Array.isArray(value,) ? value.join(", ",) : value;
    parts.push(step.formatTemplate.replace("{value}", rendered,),);
  }
  return parts.join("\n",);
}

/**
 * Confirm the run and produce the dispatch envelope.
 * @param workflow - Resolved workflow template
 * @param run - Current run (all steps must be filled)
 * @param prompt - Assembled prompt (from assemblePrompt)
 * @returns Dispatch envelope for the caller to POST
 * @throws When steps are missing or the workflow requires explicit confirmation
 */
export function confirmAndDispatch(
  workflow: AssistantWorkflowConfig,
  run: WorkflowRun,
  prompt: string,
): WorkflowDispatch {
  const missing = workflow.steps
    .filter((step,) => run.values[step.id] === undefined)
    .map((step,) => step.id);
  if (missing.length > 0) {
    throw new Error(
      `workflow "${workflow.id}" missing steps: ${missing.join(", ",)}`,
    );
  }
  if ((workflow.approval?.type ?? "confirm") === "confirm" && !run.confirmed) {
    throw new Error(`workflow "${workflow.id}" requires confirmation before dispatch`,);
  }
  const payload: Record<string, unknown> = {};
  for (const [key, template,] of Object.entries(workflow.dispatch.payloadTemplate,)) {
    payload[key] = typeof template === "string"
      ? template.replace("{prompt}", prompt,)
      : template;
  }
  return {
    backend: workflow.dispatch.backend,
    target: workflow.dispatch.target,
    payload,
  };
}

/**
 * Mark the run confirmed (user accepted the preview).
 * @param run - Current run
 * @returns The same run for chaining
 */
export function confirmRun(run: WorkflowRun,): WorkflowRun {
  run.confirmed = true;
  return run;
}

/**
 * Validate one raw step value per step kind + constraints.
 * @param workflowId - Owning workflow (error context)
 * @param step - Step definition
 * @param value - Raw user input
 * @returns Normalized value (trimmed strings)
 */
function validateStepValue(
  workflowId: string,
  step: WorkflowStepConfig,
  value: string | string[],
): string | string[] {
  const where = `workflows.${workflowId}.steps.${step.id}`;
  if (step.type === "multi") {
    const list = Array.isArray(value,)
      ? value
      : String(value,).split(",",).map((v,) => v.trim()).filter((v,) => v !== "");
    if (list.length === 0) {
      throw new Error(`${where} requires at least one selection`,);
    }
    if (step.options !== undefined) {
      for (const item of list) {
        if (!step.options.includes(item,)) {
          throw new Error(`${where} invalid option "${item}"`,);
        }
      }
    }
    return list;
  }
  if (Array.isArray(value,)) {
    throw new Error(`${where} expects a single value, got a list`,);
  }
  const text = value.trim();
  if (text === "") {
    throw new Error(`${where} must not be empty`,);
  }
  if (step.type === "choice" && step.options !== undefined && !step.options.includes(text,)) {
    throw new Error(`${where} invalid option "${text}"`,);
  }
  if (step.minLength !== undefined && text.length < step.minLength) {
    throw new Error(`${where} must be at least ${step.minLength} characters`,);
  }
  if (step.maxLength !== undefined && text.length > step.maxLength) {
    throw new Error(`${where} must be at most ${step.maxLength} characters`,);
  }
  return text;
}
