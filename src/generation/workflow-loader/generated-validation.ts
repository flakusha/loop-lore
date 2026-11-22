// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pre-submit validation for assistant-generated ComfyUI graphs.
 *
 * Everything checkable without a live ComfyUI is checked here so a malformed
 * generated graph fails before any model load or queue slot is spent. The
 * ingest validator carries the shared node-shape / placeholder / dead-node
 * rules; this module adds the two properties specific to generated graphs —
 * a real output node and no unreplaced template variables.
 */
import { UNREFERENCED_LIVE_CLASSES, } from "../comfyui-converter/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { validateWorkflowPayload, } from "../workflow-library/validate";
import { collectPlaceholders, } from "../workflow-substitutor";
import { findDeadNodes, hasTerminalSink, } from "./workflow-validation";

/** Options for {@link validateGeneratedGraph} and {@link assertGeneratedGraph}. */
export interface GeneratedGraphOptions {
  /** Converter-reported ids that are live despite being unreferenced. */
  readonly unreferencedLive?: readonly string[];
}

/** Outcome of validating an assistant-generated graph. */
export interface GeneratedGraphResult {
  /** True only when no defect was found. */
  readonly ok: boolean;
  /** Every defect found, in the order the checks ran. */
  readonly errors: string[];
}

/**
 * Validate a generated graph without contacting ComfyUI.
 *
 * Reuses {@link validateWorkflowPayload} with a minimal synthetic payload so
 * the disk, DB and generated paths agree on node shape, parameter binding and
 * the dead-node allowlist. On top of that it requires a real terminal sink and
 * no leftover `{{placeholder}}` variables.
 *
 * @param graph - The generated graph to check
 * @param options - Converter exemption ids; omitted means strict
 * @returns All defects found; `ok` is true only for an empty error list
 */
export function validateGeneratedGraph(
  graph: ComfyUIWorkflow,
  options: GeneratedGraphOptions = {},
): GeneratedGraphResult {
  // Generated graphs are untrusted: the downstream helpers call
  // Object.values/entries, so keep malformed input on the result path.
  if (typeof graph !== "object" || graph === null) {
    return { ok: false, errors: ["graph must be an object",], };
  }

  const errors: string[] = [];

  const payload = validateWorkflowPayload(
    {
      body: graph,
      category: "txt2img",
      parameters: [],
      requiredNodes: [],
    },
    options,
  );

  if (!payload.ok) { errors.push(...payload.errors,); }

  if (!hasTerminalSink(graph,)) {
    errors.push("graph has no terminal sink",);
  }

  const placeholders = collectPlaceholders(graph,);
  if (placeholders.size > 0) {
    errors.push(`unresolved placeholder(s): ${[...placeholders,].join(", ",)}`,);
  }

  // Same allowlist as validateWorkflowPayload: an id is exempt only when it
  // is both converter-reported and in an allowlisted control/config class.
  // The message matches the ingest one so the Set below collapses the repeat.
  const exempt = new Set(options.unreferencedLive ?? [],);
  const dead = findDeadNodes(graph,).filter((id,) => {
    const node = graph[id];
    return !(exempt.has(id,) && node !== undefined && UNREFERENCED_LIVE_CLASSES.has(node.class_type,));
  },);

  if (dead.length > 0) {
    errors.push(`dead node(s) not linked into the graph: ${dead.join(", ",)}`,);
  }

  const unique = [...new Set(errors,),];
  return { ok: unique.length === 0, errors: unique, };
}

/**
 * Throw on an invalid generated graph.
 *
 * @param graph - The generated graph to check
 * @param options - Converter exemption ids; omitted means strict
 * @throws Error with every validation message joined when the graph is invalid
 */
export function assertGeneratedGraph(
  graph: ComfyUIWorkflow,
  options?: GeneratedGraphOptions,
): void {
  const result = validateGeneratedGraph(graph, options,);
  if (!result.ok) { throw new Error(result.errors.join("; ",),); }
}
