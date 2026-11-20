// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Run-parameter validation at the image-edit trust boundary.
 *
 * One pass covers the declared template ranges and the two discovered
 * ComfyUI sampling axes, so a run cannot submit a graph with an out-of-range
 * widget or an uninstalled sampler/scheduler. Sampling values come only from
 * live `/object_info` discovery; editor option lists are advisory UX.
 * @module image-edit/validate-run-params
 */
import type { SamplingDiscoveryResult, } from "../generation/comfyui-sampling";
import { clamp, } from "../utils/clamp";
import type { WorkflowTemplate, } from "./types";

/** Parameter names that map to the discovered sampler axis. */
const SAMPLER_PARAMS = new Set(["sampler", "sampler_name",],);
/** Parameter names that map to the discovered scheduler axis. */
const SCHEDULER_PARAMS = new Set(["scheduler",],);

/** Whether a template declares either sampling axis (gates discovery). */
export function hasSamplingParams(
  template: Pick<WorkflowTemplate, "parameters">,
): boolean {
  return template.parameters.some(
    (param,) => SAMPLER_PARAMS.has(param.name,) || SCHEDULER_PARAMS.has(param.name,),
  );
}

/** Input to {@link validateRunParams}. */
export interface RunParamValidationInput {
  template: Pick<WorkflowTemplate, "parameters">;
  params: Record<string, unknown>;
  /** Live discovery; when absent or unreachable the axes are not validated. */
  sampling?: SamplingDiscoveryResult | null;
}

/**
 * Validate every declared template parameter before `build()` runs.
 * @param input
 * @returns human-readable violations, empty when the params are usable
 */
export function validateRunParams({
  template,
  params,
  sampling,
}: RunParamValidationInput,): string[] {
  const violations: string[] = [];

  // `missingRequiredParams` (called by the route) treats 0/false as present,
  // so only undefined/null reach here and are left to the caller's 400.
  for (const param of template.parameters) {
    const value = params[param.name];
    if (value === undefined || value === null) { continue; }

    const samplerAxis = SAMPLER_PARAMS.has(param.name,);
    const schedulerAxis = SCHEDULER_PARAMS.has(param.name,);
    if (samplerAxis || schedulerAxis) {
      const valid = samplerAxis ? sampling?.samplers : sampling?.schedulers;
      const axis = samplerAxis ? "sampler" : "scheduler";
      // No discovery (unreachable ComfyUI / no KSampler) => no honest way to
      // reject. Never fall back to a shipped list for validation.
      if (valid && valid.length > 0 && !valid.includes(String(value,),)) {
        violations.push(
          `${param.name}: ${String(value,)} is not an installed ${axis} (valid values: ${valid.join(", ",)})`,
        );
      }

      continue;
    }

    if (param.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value,)) {
        violations.push(`${param.name}: expected a finite number, received ${String(value,)}`,);
        continue;
      }

      if (param.min !== undefined || param.max !== undefined) {
        const bounded = clamp(value, param.min ?? -Infinity, param.max ?? Infinity,);
        if (bounded !== value) {
          violations.push(
            `${param.name}: ${value} is outside [${param.min ?? "-∞"}, ${param.max ?? "∞"}]`,
          );

          continue;
        }
      }

      if (param.step !== undefined && param.step > 0) {
        const base = param.min ?? 0;
        const remainder = (value - base) % param.step;
        if (Math.min(Math.abs(remainder,), Math.abs(remainder - param.step,),) > 1e-9) {
          violations.push(
            `${param.name}: ${value} is off-step (must align to ${param.step} from ${base})`,
          );
        }
      }

      continue;
    }

    if (param.type === "select" && param.options) {
      const allowed = param.options.map((option,) => option.value);
      if (!allowed.some((option,) => option === value)) {
        violations.push(
          `${param.name}: ${String(value,)} is not an allowed value (valid values: ${
            allowed.map(String,).join(", ",)
          })`,
        );
      }
    }
  }

  return violations;
}
