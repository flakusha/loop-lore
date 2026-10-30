// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Placeholder injection: write whole-string `{{name}}` tokens at marked
 * inputs of the converted API graph.
 *
 * Injection reuses `applyNodeOverrides` unchanged — the override map is
 * node id → input → whole-string placeholder, so `substituteWorkflow`
 * preserves each value's own type at build time and `uploadImageParams`
 * keeps working for `image` params.
 *
 * @module comfyui-params/inject
 */
import type { ApiGraph, } from "../comfyui-converter/types";
import { applyNodeOverrides, } from "../workflow-substitutor";
import type { MarkedInput, } from "./marks";

/** One injected placeholder: which graph input carries which `{{var}}`. */
export interface InjectedPlaceholder {
  readonly nodeId: string;
  readonly inputName: string;
  readonly parameterName: string;
}

/** Options for {@link injectPlaceholders}. */
export interface InjectOptions {
  readonly graph: ApiGraph;
  readonly bindings: readonly InjectedPlaceholder[];
}

/** Resolve marked inputs against the converted graph (flat id + input). */
export interface ResolveOptions {
  readonly graph: ApiGraph;
  readonly marked: readonly MarkedInput[];
  readonly nameOf: (marked: MarkedInput,) => string;
}

/**
 * Match marked inputs to converted-graph nodes, dropping linked/missing ones.
 * @param options - Graph, marks, and the mark→parameter-name mapping
 * @returns Bindings ready for {@link injectPlaceholders}
 */
export function resolveBindings(options: ResolveOptions,): InjectedPlaceholder[] {
  const { graph, marked, nameOf, } = options;
  const bindings: InjectedPlaceholder[] = [];
  const seen = new Set<string>();
  const bind = (
    binding: { readonly nodeId: string; readonly inputName: string; readonly parameterName: string },
  ): void => {
    const target = graph[binding.nodeId];
    if (target === undefined) { return; }
    if (!(binding.inputName in target.inputs)) { return; }
    const current = target.inputs[binding.inputName];
    if (Array.isArray(current,)) { return; }
    if (typeof current === "string" && current.includes("{{",)) { return; }
    const key = `${binding.nodeId} ${binding.inputName}`;
    if (seen.has(key,)) { return; }
    seen.add(key,);
    bindings.push({ nodeId: binding.nodeId, inputName: binding.inputName, parameterName: binding.parameterName, },);
  };

  for (const mark of marked) {
    const parameterName = nameOf(mark,);
    if (mark.targets.length > 0) {
      for (const target of mark.targets) {
        bind({ nodeId: target.nodeId, inputName: target.inputName, parameterName, },);
      }

      continue;
    }

    bind({ nodeId: mark.nodeId as string, inputName: mark.inputName, parameterName, },);
  }

  return bindings;
}

/**
 * Write `{{name}}` tokens into the converted graph at the bound inputs.
 * @param options - Graph plus bindings from {@link resolveBindings}
 * @returns New graph with placeholders; the input graph is untouched
 */
export function injectPlaceholders(options: InjectOptions,): ApiGraph {
  const { graph, bindings, } = options;
  const overrides = new Map<string, Record<string, unknown>>();
  for (const binding of bindings) {
    const fields = overrides.get(binding.nodeId,) ?? {};
    fields[binding.inputName] = `{{${binding.parameterName}}}`;
    overrides.set(binding.nodeId, fields,);
  }

  return applyNodeOverrides(graph, overrides,);
}
