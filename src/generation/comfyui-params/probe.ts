// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Acceptance probe: stubbed-ComfyUI validation of a derived workflow row.
 *
 * Given a `DeriveResult` plus its converted graph and the pinned snapshot,
 * the probe injects the `{{placeholders}}`, substitutes the smallest
 * parameter set that exercises every binding (each parameter's own
 * default) offline through `substituteWorkflow`, and reports binding
 * coverage: every derived parameter bound, every placeholder resolvable.
 * One boundary pin may fan out to several inner inputs, so a parameter
 * bound more than once is reported, not failed.
 *
 * Offline throughout — the snapshot is a committed fixture; no server, no
 * weights. Server-side submission is out of scope (deferred per ticket).
 *
 * Parallel-safe by construction: the probe is a pure function of its
 * options — no listening socket (no server at all, stubbed or otherwise),
 * no filesystem writes, no shared mutable state. Concurrent runs share only
 * the committed snapshot fixture, read-only. Each call allocates its own
 * bindings and substitution vars, so there is nothing to tear down and no
 * `afterEach`/`finally` to forget; a failed probe leaks nothing.
 *
 * @module comfyui-params/probe
 */
import { type Brand, brand, } from "../../utils/brands";
import type { ApiGraph, ObjectInfoSnapshot, } from "../comfyui-converter/types";
import { collectPlaceholders, substituteWorkflow, type SubstitutionVars, } from "../workflow-substitutor";
import { ParameterDerivationError, } from "./errors";
import { type InjectedPlaceholder, injectPlaceholders, } from "./inject";
import type { DeriveResult, } from "./types";

/** Probe-run identity: the workflow row under test. */
export type ProbeWorkflowId = Brand<string, "ProbeWorkflowId">;

/** Options for {@link runAcceptanceProbe}. */
export interface ProbeOptions {
  readonly workflowId: string;
  readonly graph: ApiGraph;
  readonly derived: DeriveResult;
  readonly snapshot: ObjectInfoSnapshot;
  readonly expectedOutputKind: string;
}

/** A parameter bound to more than one input (boundary-pin fan-out). */
export interface ProbeFanOut {
  readonly name: string;
  readonly bindings: number;
}

/** Outcome of {@link runAcceptanceProbe}. */
export interface ProbeResult {
  readonly workflowId: ProbeWorkflowId;
  readonly ok: boolean;
  readonly parameters: number;
  readonly bindings: number;
  readonly fanOut: readonly ProbeFanOut[];
  readonly errors: readonly string[];
}

/** Node classes that emit the expected output kind, by class-name match. */
const KIND_MATCHERS: Readonly<Record<string, RegExp>> = {
  image: /saveimage|previewimage|imagesaver/i,
  video: /savevideo|videocombine|continuitypublish/i,
  audio: /saveaudio/i,
};

/**
 * Flatten the override map back into placeholder bindings for injection.
 * @param derived - Derived parameters plus the `{{var}}` override map
 * @returns Bindings ready for {@link injectPlaceholders}
 */
function bindingsOf(derived: DeriveResult,): InjectedPlaceholder[] {
  const bindings: InjectedPlaceholder[] = [];
  for (const [nodeId, fields,] of derived.overrides) {
    for (const [inputName, token,] of Object.entries(fields,)) {
      bindings.push({ nodeId, inputName, parameterName: token.slice(2, -2,), },);
    }
  }

  return bindings;
}

/**
 * Run the stubbed acceptance probe for a derived workflow row.
 * @param options - Row id, converted graph, derived params, snapshot, output kind
 * @throws {ParameterDerivationError} When a derived parameter has no binding
 * @returns Coverage report; `ok` is false on any checkable defect
 */
export function runAcceptanceProbe(options: ProbeOptions,): ProbeResult {
  const { workflowId, graph, derived, snapshot, expectedOutputKind, } = options;
  const errors: string[] = [];
  const fanOut: ProbeFanOut[] = [];
  const bindings = bindingsOf(derived,);

  const counts = new Map<string, number>();
  for (const binding of bindings) {
    counts.set(binding.parameterName, (counts.get(binding.parameterName,) ?? 0) + 1,);
  }

  for (const parameter of derived.parameters) {
    const covered = counts.get(parameter.name,) ?? 0;
    if (covered === 0) {
      throw new ParameterDerivationError({ kind: "unknown-override-target", target: parameter.name, },);
    }

    if (covered > 1) {
      fanOut.push({ name: parameter.name, bindings: covered, },);
    }
  }

  const names = new Set(derived.parameters.map((parameter,) => parameter.name),);
  const orphaned = [...counts.keys(),].filter((name,) => !names.has(name,));
  if (orphaned.length > 0) {
    errors.push(`bindings without a parameter: ${orphaned.toSorted().join(", ",)}`,);
  }

  const classes = new Set(Object.values(graph,).map((node,) => node.class_type),);
  const missing = [...classes,].filter((className,) => !(className in snapshot));
  if (missing.length > 0) {
    errors.push(`missing node classes: ${missing.toSorted().join(", ",)}`,);
  }

  const dangling: string[] = [];
  for (const [id, node,] of Object.entries(graph,)) {
    for (const [input, value,] of Object.entries(node.inputs,)) {
      if (Array.isArray(value,) && typeof value[0] === "string" && !(value[0] as string in graph)) {
        dangling.push(`${id}.${input}`,);
      }
    }
  }

  if (dangling.length > 0) {
    errors.push(`dangling links: ${dangling.toSorted().join(", ",)}`,);
  }

  const matcher = KIND_MATCHERS[expectedOutputKind.toLowerCase()];
  const emitted = [...classes,].filter((className,) => matcher?.test(className,) ?? false);
  if (matcher === undefined || emitted.length === 0) {
    errors.push(
      `wrong output kind: expected ${expectedOutputKind}, graph classes [${[...classes,].toSorted().join(", ",)}]`,
    );
  }

  const injected = injectPlaceholders({ graph, bindings, },);
  const vars: SubstitutionVars = {};
  for (const parameter of derived.parameters) {
    const value = parameter.default;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      vars[parameter.name] = value;
    }
  }

  // Check coverage on the injected graph, before substitution: the
  // substitutor maps an unknown placeholder to "", so scanning the output
  // would always come back clean (the same reason `buildWorkflowGraph`
  // resolves the needed set from the body first).
  const needed = [...collectPlaceholders(injected,),];
  const unresolved = needed.filter((name,) => !(name in vars));
  if (unresolved.length > 0) {
    errors.push(`unresolved placeholders: ${unresolved.toSorted().join(", ",)}`,);
  } else {
    substituteWorkflow(injected, vars,);
  }

  return {
    workflowId: brand<"ProbeWorkflowId">(workflowId,),
    ok: errors.length === 0,
    parameters: derived.parameters.length,
    bindings: bindings.length,
    fanOut,
    errors,
  };
}
