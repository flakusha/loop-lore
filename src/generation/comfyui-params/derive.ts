// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Derivation orchestrator: marks → typed params → sidecar → placeholders.
 *
 * Re-derivation is idempotent with INSERT-IF-CHANGED semantics: an
 * operator-edited row keeps its labels/bounds/defaults unless the
 * sidecar changed — pass `existing` (the row's current parameters) and
 * only sidecar-touched parameters are rewritten; fresh marks are added
 * and vanished marks are dropped.
 *
 * @module comfyui-params/derive
 */
import type { TemplateParameter, } from "../../image-edit/types";
import { ParameterDerivationError, } from "./errors";
import { resolveBindings, } from "./inject";
import { collectMarked, type MarkedInput, } from "./marks";
import { applySidecar, } from "./sidecar";
import { mapSpecToParam, } from "./type-map";
import type { DeriveOptions, DeriveResult, } from "./types";

function deriveFresh(options: DeriveOptions, marked: readonly MarkedInput[],): {
  parameters: TemplateParameter[];
  nameOf: (mark: MarkedInput,) => string;
} {
  const taken = new Set<string>();
  const parameters: TemplateParameter[] = [];
  const names = new Map<MarkedInput, string>();
  for (const mark of marked) {
    const derived = mapSpecToParam({ marked: mark, snapshot: options.snapshot, }, taken,);
    if (derived === null) { continue; }
    taken.add(derived.parameter.name,);
    parameters.push(derived.parameter,);
    names.set(mark, derived.parameter.name,);
  }

  const seen = new Set<string>();
  for (const parameter of parameters) {
    if (seen.has(parameter.name,)) {
      throw new ParameterDerivationError({ kind: "duplicate-parameter", name: parameter.name, },);
    }

    seen.add(parameter.name,);
  }

  return {
    parameters,
    nameOf: (mark: MarkedInput,) => names.get(mark,) ?? mark.inputName,
  };
}

function mergeExisting(
  fresh: TemplateParameter[],
  existing: readonly TemplateParameter[],
  sidecar: Readonly<Record<string, unknown>>,
): TemplateParameter[] {
  const previous = new Map(existing.map((parameter,) => [parameter.name, parameter,]),);
  return fresh.map((parameter,) => {
    const kept = previous.get(parameter.name,);
    if (kept === undefined || parameter.name in sidecar) { return parameter; }
    return { ...parameter, label: kept.label, description: kept.description ?? parameter.description, };
  },);
}

/**
 * Derive a workflow row's parameters and placeholder overrides from marks.
 * @param options - Workflow, converted graph, snapshot, sidecar, existing row params
 * @throws {ParameterDerivationError} On duplicate names or unknown sidecar targets
 * @returns Parameters plus the injected graph overrides
 */
export function deriveParameters(options: DeriveOptions,): DeriveResult {
  const marked = collectMarked({ workflow: options.workflow, },);
  const fresh = deriveFresh(options, marked,);
  const sidecar = options.sidecar ?? {};
  const corrected = applySidecar({ parameters: fresh.parameters, sidecar, },);
  const correctedNames = new Set(corrected.map((parameter,) => parameter.name),);
  const hidden = new Set(
    fresh.parameters.map((parameter,) => parameter.name).filter((name,) => !correctedNames.has(name,)),
  );

  const nameOf = (mark: MarkedInput,): string => {
    const derived = fresh.nameOf(mark,);
    if (hidden.has(derived,)) { return derived; }
    const rename = sidecar[derived]?.rename;
    if (rename !== undefined && correctedNames.has(rename,)) { return rename; }
    return derived;
  };

  const bindings = resolveBindings({ graph: options.converted, marked, nameOf, },);
  const valid = new Set(bindings.map((binding,) => binding.parameterName),);
  const parameters = corrected.filter((parameter,) => valid.has(parameter.name,));
  const merged = options.existing === undefined
    ? parameters
    : mergeExisting(parameters, options.existing, sidecar,);

  const overrides = new Map<string, Readonly<Record<string, string>>>();
  for (const binding of bindings) {
    if (!merged.some((parameter,) => parameter.name === binding.parameterName)) { continue; }
    const fields = (overrides.get(binding.nodeId,) ?? {}) as Record<string, string>;
    fields[binding.inputName] = `{{${binding.parameterName}}}`;
    overrides.set(binding.nodeId, fields,);
  }

  return { parameters: merged, overrides, };
}
