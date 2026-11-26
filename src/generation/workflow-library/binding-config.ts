// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Operator-owned declarative bindings config.
 *
 * The file lives beside the graphs it binds (`configs/workflows/api-bindings.json`).
 * Loading is fail-closed: a malformed config, a pin that does not match the
 * bundled `/object_info` fixture, or a target that no longer exists rejects
 * the whole config so no workflow is seeded from a stale description.
 */
import fs from "node:fs/promises";
import { join, } from "node:path";
import type { TemplateParameter, } from "../../image-edit/types";
import { jsonParseOr, } from "../../utils";
import { verifyPinnedObjectInfoSha256, } from "../comfyui-converter/schema-authority";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { isValidWorkflow, } from "../workflow-loader/workflow-validation";
import {
  parseWorkflowBindings,
  validateBindingTargets,
  type WorkflowBindingConfig,
  type WorkflowBindingSpec,
} from "./bindings";

/** Config filename; the seed must never try to import it as a workflow. */
export const BINDINGS_FILE = "api-bindings.json";

/** Outcome of reading the optional bindings config. */
export type BindingConfigLoad =
  | { ok: true; config: WorkflowBindingConfig | null }
  | { ok: false; errors: string[] };

/**
 * Read and verify the bindings config in a workflow directory.
 *
 * A missing file is not an error — config-driven bindings are optional. A
 * present file must parse, bind only to nodes that exist in the graph files
 * beside it, and — if it asserts a snapshot digest — match the bundled fixture.
 * @param dir - Directory holding graphs and the optional config
 * @returns The verified config, `null` when absent, or every error found
 */
export async function loadWorkflowBindings(dir: string,): Promise<BindingConfigLoad> {
  let text: string;
  try {
    text = await fs.readFile(join(dir, BINDINGS_FILE,), "utf8",);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, config: null, };
    }

    return { ok: false, errors: [`cannot read ${BINDINGS_FILE}: ${String(error,)}`,], };
  }

  const value = jsonParseOr<unknown>(text, undefined,);
  if (value === undefined) {
    return { ok: false, errors: [`${BINDINGS_FILE} is not valid JSON`,], };
  }

  const parsed = parseWorkflowBindings(value,);
  if (!parsed.ok) { return parsed; }

  const errors: string[] = [];
  const digest = parsed.config.snapshot?.objectInfoSha256;
  if (digest !== undefined) {
    const pin = await verifyPinnedObjectInfoSha256(digest,);
    if (!pin.ok) { errors.push(pin.error,); }
  }

  for (const [id, spec,] of Object.entries(parsed.config.workflows,)) {
    let graphText: string;
    try {
      graphText = await fs.readFile(join(dir, `${id}.json`,), "utf8",);
    } catch (error) {
      errors.push(`workflows.${id}: cannot read graph: ${String(error,)}`,);
      continue;
    }

    const graph = jsonParseOr<unknown>(graphText, undefined,);
    if (!isValidWorkflow(graph,)) {
      errors.push(`workflows.${id}: graph is not a loadable ComfyUI workflow`,);
      continue;
    }

    errors.push(
      ...validateBindingTargets(spec, graph as ComfyUIWorkflow,).map(
        (message,) => `workflows.${id}: ${message}`,
      ),
    );
  }

  return errors.length > 0 ? { ok: false, errors, } : { ok: true, config: parsed.config, };
}

/**
 * Resolve the parameters a workflow should declare from its spec.
 *
 * `augment` keeps derived placeholders the config does not declare; `explicit`
 * uses only the config's list. A workflow without a spec keeps its derived set
 * — that is the shipped-library path.
 * @param spec - Spec for this workflow, when the config mentions it
 * @param derived - Parameters derived from the graph's placeholders
 * @param policy - Config binding policy
 * @returns The parameters to store on the payload
 */
export function parametersForSpec(
  spec: WorkflowBindingSpec | undefined,
  derived: TemplateParameter[],
  policy: WorkflowBindingConfig["bindingPolicy"],
): TemplateParameter[] {
  if (spec === undefined) { return derived; }
  const declared = spec.parameters ?? [];
  if (policy === "explicit") { return [...declared,]; }

  const named = new Set(declared.map((parameter,) => parameter.name),);
  return [...declared, ...derived.filter((parameter,) => !named.has(parameter.name,)),];
}
