// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request-time preflight for structured generation jobs.
 *
 * One pure gate over the two validators that already ship: a ComfyUI graph
 * ({@link validateGraph}) and a LoRA config ({@link validateLoRAConfig}),
 * plus parsed LoRA string entries ({@link PreflightInput.loraEntries}).
 * Callers pass only the fields they accept; absent fields are not validated.
 * No I/O, no provider calls, no throw across the boundary — a malformed
 * payload comes back as one typed failure the route maps to a 4xx.
 *
 * Intentional asymmetry: the request boundary is STRICT for `loraEntries`
 * (malformed entry or out-of-range strength → 400), while the runtime
 * template build stays LENIENT (parseLoraString silently skips what it
 * cannot parse). Entries the parser drops never reach this gate —
 * parse-then-validate means parser-dropped entries bypass strictness by
 * design; runtime leniency is unchanged.
 *
 * Field order when multiple failures exist: workflow, then structured lora
 * config, then loraEntries.
 *
 * Deliberately out of scope: attention / bypass / mute knobs and model
 * presence. Those are operator decisions, not request validation.
 */
import { validateGraph, } from "./builder/graph-validate";
import { LORA_STRENGTH_MAX, LORA_STRENGTH_MIN, } from "./lora/types";
import { validateLoRAConfig, } from "./lora/validation";

/** A parsed LoRA string entry, structural (no image-edit import here). */
interface PreflightLoraEntry {
  path: string;
  strength: number;
}

/** Fields a caller may hand to the preflight. */
export interface PreflightInput {
  /** Raw ComfyUI graph (API-format record or node array). */
  workflow?: unknown;
  /** LoRA config object. */
  lora?: unknown;
  /**
   * LoRA entries parsed from the request's params.loras string. STRICT at
   * this boundary; the runtime build stays lenient (see module docs).
   */
  loraEntries?: PreflightLoraEntry[];
}

/** The field a failure belongs to, for the caller's error mapping. */
export type PreflightField = "workflow" | "lora" | "loras";

/** Single failure shape — message is ready to render in a 4xx envelope. */
export interface PreflightFailure {
  ok: false;
  field: PreflightField;
  error: string;
}

export type PreflightResult = { ok: true } | PreflightFailure;

/**
 * Validate the supplied graph / LoRA config / LoRA string entries, returning
 * one typed failure or success. Malformed values are reported, never thrown.
 * @param input - the structured fields the caller accepts
 * @returns success, or the first failure in workflow-then-lora-then-loras order
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

  if (input.loraEntries !== undefined) {
    for (const [index, entry,] of input.loraEntries.entries()) {
      if (typeof entry?.path !== "string" || entry.path.trim().length === 0) {
        return {
          ok: false,
          field: "loras",
          error: `Invalid LoRA entry at position ${index}: path must be a non-empty string`,
        };
      }

      if (
        typeof entry.strength !== "number" || !Number.isFinite(entry.strength,) ||
        entry.strength < LORA_STRENGTH_MIN || entry.strength > LORA_STRENGTH_MAX
      ) {
        return {
          ok: false,
          field: "loras",
          error:
            `Invalid LoRA strength at position ${index}: must be between ${LORA_STRENGTH_MIN} and ${LORA_STRENGTH_MAX}`,
        };
      }
    }
  }

  return { ok: true, };
}
