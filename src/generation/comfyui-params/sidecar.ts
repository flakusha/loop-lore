// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sidecar overrides (`<workflowId>.overrides.json`): operator renames,
 * hides, and bound/option/label corrections applied after derivation.
 *
 * Every override target must name a derived parameter — an unknown target
 * is an error, never a silent skip, so a renamed mark cannot leave a
 * stale correction behind.
 *
 * @module comfyui-params/sidecar
 */
import type { TemplateParameter, } from "../../image-edit/types";
import { ParameterDerivationError, } from "./errors";

/** One parameter correction: rename, hide, or metadata override. */
export interface SidecarOverride {
  readonly rename?: string;
  readonly hide?: boolean;
  readonly label?: string;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: Array<{ label: string; value: unknown }>;
  readonly default?: unknown;
}

/** Sidecar file shape: parameter name → correction. */
export type SidecarOverrides = Readonly<Record<string, SidecarOverride>>;

/** Options for {@link applySidecar}. */
export interface ApplySidecarOptions {
  readonly parameters: readonly TemplateParameter[];
  readonly sidecar: SidecarOverrides;
}

function applyOne(parameter: TemplateParameter, override: SidecarOverride,): TemplateParameter | null {
  if (override.hide === true) { return null; }
  return {
    ...parameter,
    ...(override.rename === undefined ? {} : { name: override.rename, }),
    ...(override.label === undefined ? {} : { label: override.label, }),
    ...(override.description === undefined ? {} : { description: override.description, }),
    ...(override.min === undefined ? {} : { min: override.min, }),
    ...(override.max === undefined ? {} : { max: override.max, }),
    ...(override.step === undefined ? {} : { step: override.step, }),
    ...(override.options === undefined ? {} : { options: override.options, }),
    ...(override.default === undefined ? {} : { default: override.default, }),
  };
}

/**
 * Apply sidecar corrections to derived parameters.
 * @param options - Derived parameters plus the sidecar map
 * @throws {ParameterDerivationError} On unknown override targets
 * @returns Corrected parameters (hidden ones dropped), in derivation order
 */
export function applySidecar(options: ApplySidecarOptions,): TemplateParameter[] {
  const { parameters, sidecar, } = options;
  const byName = new Map(parameters.map((parameter,) => [parameter.name, parameter,]),);
  for (const target of Object.keys(sidecar,)) {
    if (!byName.has(target,)) {
      throw new ParameterDerivationError({ kind: "unknown-override-target", target, },);
    }
  }

  const out: TemplateParameter[] = [];
  for (const parameter of parameters) {
    const override = sidecar[parameter.name];
    if (override === undefined) {
      out.push(parameter,);
      continue;
    }

    const applied = applyOne(parameter, override,);
    if (applied !== null) { out.push(applied,); }
  }

  return out;
}
