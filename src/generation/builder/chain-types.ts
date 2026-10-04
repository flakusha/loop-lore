// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builder chain payload — an ordered list of workflow-template steps with
 * per-stage parameter bindings, stored inline in `prompt_templates.payload`
 * under modality `workflow` (first-class-citizen epic amendment: inline
 * payload, no new table).
 *
 * A chain is a payload *variant* of the workflow modality: graph rows carry
 * `body`/`category`, chain rows carry `kind: "chain"` + `steps`. The shape
 * probe branches on that so the two can never be confused at read time.
 */

/** One step of a builder chain. */
export interface ChainStep {
  /** Stable step id within the chain; unique per chain. */
  id: string;
  /** Image-edit template id the step executes (registry or workflow row). */
  templateId: string;
  /** Per-stage parameter bindings handed to the step's run. */
  params: Record<string, string | number | boolean>;
}

/** Chain payload variant stored under `prompt_templates.modality = workflow`. */
export interface ChainPayload {
  kind: "chain";
  steps: ChainStep[];
}

/** Outcome of validating an untrusted chain payload. */
export type ChainValidation =
  | { ok: true; payload: ChainPayload }
  | { ok: false; errors: string[] };

/**
 * Structural probe for a chain payload.
 * @param record - Already-parsed payload candidate
 * @returns true when the value carries `kind: "chain"` and a `steps` array
 */
export function isChainPayloadShape(record: Record<string, unknown>,): boolean {
  return record.kind === "chain" && Array.isArray(record.steps,);
}

/**
 * Validate an untrusted value as a storable chain payload.
 *
 * Callers store `result.payload` (not the input) so what lands in the DB is
 * the same shape that was checked.
 * @param value - Untrusted, already JSON-parsed value
 * @returns the normalized chain payload, or the list of errors
 */
export function validateChainPayload(value: unknown,): ChainValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    return { ok: false, errors: ["chain payload must be an object",], };
  }

  const record = value as Record<string, unknown>;
  if (!isChainPayloadShape(record,)) {
    return { ok: false, errors: ['chain payload requires kind: "chain" and a steps array',], };
  }

  const errors: string[] = [];
  const steps: ChainStep[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry,] of (record.steps as unknown[]).entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry,)) {
      errors.push(`steps[${index}] must be an object`,);
      continue;
    }

    const step = entry as Record<string, unknown>;
    if (typeof step.id !== "string" || step.id.length === 0) {
      errors.push(`steps[${index}] requires a non-empty id`,);
      continue;
    }

    if (seenIds.has(step.id,)) {
      errors.push(`steps[${index}]: duplicate step id ${step.id}`,);
      continue;
    }

    seenIds.add(step.id,);
    if (typeof step.templateId !== "string" || step.templateId.length === 0) {
      errors.push(`steps[${index}] requires a non-empty templateId`,);
      continue;
    }

    const params = step.params;
    if (typeof params !== "object" || params === null || Array.isArray(params,)) {
      errors.push(`steps[${index}]: params must be an object`,);
      continue;
    }

    const cleanParams: ChainStep["params"] = {};
    let paramsOk = true;
    for (const [name, raw,] of Object.entries(params as Record<string, unknown>,)) {
      if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
        errors.push(`steps[${index}]: param ${name} must be a string, number, or boolean`,);
        paramsOk = false;
        continue;
      }

      cleanParams[name] = raw;
    }

    if (!paramsOk) { continue; }
    steps.push({ id: step.id, templateId: step.templateId, params: cleanParams, },);
  }

  if (errors.length > 0) { return { ok: false, errors, }; }
  return { ok: true, payload: { kind: "chain", steps, }, };
}
