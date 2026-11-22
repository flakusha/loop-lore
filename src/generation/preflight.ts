// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request-time preflight for structured generation jobs.
 *
 * One pure gate over the two validators that already ship: a ComfyUI graph
 * ({@link validateGraph}) and a LoRA config ({@link validateLoRAConfig}).
 * Callers pass only the fields they accept; absent fields are not validated.
 * No I/O, no provider calls, no throw across the boundary — a malformed
 * payload comes back as one typed failure the route maps to a 4xx.
 *
 * Deliberately out of scope: attention / bypass / mute knobs and model
 * presence. Those are operator decisions, not request validation.
 */
import { validateGraph, } from "./builder/graph-validate";
import { validateLoRAConfig, } from "./lora/validation";

/** Fields a caller may hand to the preflight. */
export interface PreflightInput {
  /** Raw ComfyUI graph (API-format record or node array). */
  workflow?: unknown;
  /** LoRA config object. */
  lora?: unknown;
}

/** The field a failure belongs to, for the caller's error mapping. */
export type PreflightField = "workflow" | "lora";

/** Single failure shape — message is ready to render in a 4xx envelope. */
export interface PreflightFailure {
  ok: false;
  field: PreflightField;
  error: string;
}

export type PreflightResult = { ok: true } | PreflightFailure;

/**
 * Validate the supplied graph / LoRA config, returning one typed failure or
 * success. Malformed values are reported, never thrown.
 * @param input - the structured fields the caller accepts
 * @returns success, or the first failure in workflow-then-lora order
 */
export function preflightRequest(input: PreflightInput,): PreflightResult {
  if (input.workflow !== undefined) {
    const validation = validateGraph(input.workflow,);
    if (!validation.ok) {
      const detail = validation.issues.map((issue,) => issue.message).join("; ",);
      return { ok: false, field: "workflow", error: `Invalid workflow graph: ${detail}`, };
    }
  }

  if (input.lora !== undefined) {
    const error = validateLoRAConfig(input.lora,);
    if (error) { return { ok: false, field: "lora", error, }; }
  }

  return { ok: true, };
}
