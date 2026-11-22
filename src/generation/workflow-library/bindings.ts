// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Declarative bindings from request parameters to ComfyUI graph inputs.
 *
 * A rule names the parameter that feeds a `{{placeholder}}` and where that
 * placeholder lives in the graph. The snapshot pins the `/object_info` reply
 * the rules were authored against, so a binding to a node or input that no
 * longer exists can be rejected instead of silently producing a broken run.
 *
 * Every entry point is total: malformed config, unknown nodes, ambiguous
 * class types and non-primitive values become error lists, never exceptions.
 * A graph input is only bound when it still carries the exact expected
 * placeholder — a value changed by hand fails closed.
 */

import type { TemplateParameter, } from "../../image-edit/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { SubstitutionVars, } from "../workflow-substitutor";

/** Exactly the value domain the substitutor can carry. */
type Primitive = SubstitutionVars[string];

const INDEX_TOKEN = "{index}";
const DEFAULT_START_INDEX = 0;
const DEFAULT_MAX_ITEMS = 4;
const PARAMETER_TYPES: readonly string[] = [
  "string",
  "number",
  "boolean",
  "select",
  "image",
  "lora",
];

const UNUSED_POLICIES: readonly string[] = ["leave", "error",];
const SHA256_RE = /^(?:sha256:)?[0-9a-fA-F]{64}$/;

/** Top-level operator config, keyed by workflow id. */
export interface WorkflowBindingConfig {
  schemaVersion: 1;
  bindingPolicy: "augment" | "explicit";
  snapshot: { objectInfoSha256: string; source?: string };
  workflows: Readonly<Record<string, WorkflowBindingSpec>>;
}

/** A graph location: an exact node id or a class type matching one node. */
export type BindingTarget =
  | { node: string; input: string }
  | { classType: string; input: string };

/** One parameter-to-placeholder rule. */
export type WorkflowBindingRule =
  | { kind: "scalar"; parameter: string; target: BindingTarget }
  | {
    kind: "fanout";
    parameter: string;
    targetTemplate: { node: string; input: string };
    startIndex?: number;
    emitAs: string;
    maxItems?: number;
    onUnusedTarget?: "leave" | "error";
  };

/** The parameter metadata and rules belonging to one workflow id. */
export interface WorkflowBindingSpec {
  parameters?: readonly TemplateParameter[];
  bindings: readonly WorkflowBindingRule[];
}

/**
 * One canonical object check for untrusted values. Every field is then
 * validated with `typeof`/`Array.isArray` at its use site; this only narrows
 * the container so those checks can read its properties.
 * @param value - Untrusted value
 * @returns The same value as a record, or null for non-objects and arrays
 */
function objectOrNull(value: unknown,): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value,)
    ? value as Record<string, unknown>
    : null;
}

function isName(value: unknown,): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPrimitive(value: unknown,): value is Primitive {
  return typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean";
}

/**
 * Error paths: non-object value; missing/empty target input; both or neither
 * of `node`/`classType`; non-string id or class type.
 * @param value - Untrusted target
 * @param path - Error prefix
 * @param errors - Accumulator
 */
function targetErrors(value: unknown, path: string, errors: string[],): void {
  const target = objectOrNull(value,);
  if (target === null) {
    errors.push(`${path}: expected an object`,);
    return;
  }

  const hasNode = target.node !== undefined;
  const hasClass = target.classType !== undefined;
  if (hasNode === hasClass) {
    errors.push(`${path}: expected exactly one of "node" or "classType"`,);
  } else if (hasNode && !isName(target.node,)) {
    errors.push(`${path}.node: expected a non-empty string`,);
  } else if (hasClass && !isName(target.classType,)) {
    errors.push(`${path}.classType: expected a non-empty string`,);
  }

  if (!isName(target.input,)) {
    errors.push(`${path}.input: expected a non-empty string`,);
  }
}

/**
 * Error paths: non-object parameter; bad/duplicate name; unsupported type;
 * missing label; non-finite numeric bound; malformed options or required flag.
 * @param value - Untrusted parameter
 * @param path - Error prefix
 * @param seen - Names already declared by this spec
 * @param errors - Accumulator
 */
function parameterErrors(
  value: unknown,
  path: string,
  seen: Set<string>,
  errors: string[],
): void {
  const parameter = objectOrNull(value,);
  if (parameter === null) {
    errors.push(`${path}: expected an object`,);
    return;
  }

  if (!isName(parameter.name,)) {
    errors.push(`${path}.name: expected a non-empty string`,);
  } else if (seen.has(parameter.name,)) {
    errors.push(`${path}.name: duplicate parameter "${parameter.name}"`,);
  } else {
    seen.add(parameter.name,);
  }

  if (typeof parameter.type !== "string" || !PARAMETER_TYPES.includes(parameter.type,)) {
    errors.push(`${path}.type: expected one of ${PARAMETER_TYPES.join(", ",)}`,);
  }

  if (typeof parameter.label !== "string") {
    errors.push(`${path}.label: expected a string`,);
  }

  for (const key of ["min", "max", "step",] as const) {
    const bound = parameter[key];
    if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound,))) {
      errors.push(`${path}.${key}: expected a finite number`,);
    }
  }

  if (parameter.options !== undefined) {
    if (!Array.isArray(parameter.options,)) {
      errors.push(`${path}.options: expected an array`,);
    } else {
      parameter.options.forEach((option, index,) => {
        const item = objectOrNull(option,);
        if (item === null || typeof item.label !== "string") {
          errors.push(`${path}.options[${index}]: expected an object with a string label`,);
        }
      },);
    }
  }

  if (parameter.required !== undefined && typeof parameter.required !== "boolean") {
    errors.push(`${path}.required: expected a boolean`,);
  }
}

/**
 * Error paths: non-object rule; missing parameter name; bad scalar target;
 * malformed fanout template, emit pattern, indices or unused-target policy;
 * unknown `kind`.
 * @param value - Untrusted rule
 * @param path - Error prefix
 * @param errors - Accumulator
 */
function ruleErrors(value: unknown, path: string, errors: string[],): void {
  const rule = objectOrNull(value,);
  if (rule === null) {
    errors.push(`${path}: expected an object`,);
    return;
  }

  if (!isName(rule.parameter,)) {
    errors.push(`${path}.parameter: expected a non-empty string`,);
  }

  if (rule.kind === "scalar") {
    targetErrors(rule.target, `${path}.target`, errors,);
    return;
  }

  if (rule.kind === "fanout") {
    const template = objectOrNull(rule.targetTemplate,);
    if (template === null) {
      errors.push(`${path}.targetTemplate: expected an object`,);
    } else {
      if (!isName(template.node,) || !template.node.includes(INDEX_TOKEN,)) {
        errors.push(`${path}.targetTemplate.node: expected a non-empty string containing "${INDEX_TOKEN}"`,);
      }

      if (!isName(template.input,)) {
        errors.push(`${path}.targetTemplate.input: expected a non-empty string`,);
      }
    }

    if (!isName(rule.emitAs,) || !rule.emitAs.includes(INDEX_TOKEN,)) {
      errors.push(`${path}.emitAs: expected a non-empty string containing "${INDEX_TOKEN}"`,);
    }

    if (rule.startIndex !== undefined && !Number.isInteger(rule.startIndex,)) {
      errors.push(`${path}.startIndex: expected an integer`,);
    }

    if (
      rule.maxItems !== undefined &&
      (!Number.isInteger(rule.maxItems,) || (rule.maxItems as number) <= 0)
    ) {
      errors.push(`${path}.maxItems: expected a positive integer`,);
    }

    if (
      rule.onUnusedTarget !== undefined &&
      (typeof rule.onUnusedTarget !== "string" ||
        !UNUSED_POLICIES.includes(rule.onUnusedTarget,))
    ) {
      errors.push(`${path}.onUnusedTarget: expected "leave" or "error"`,);
    }

    return;
  }

  errors.push(`${path}.kind: expected "scalar" or "fanout"`,);
}

/**
 * Error paths: non-object spec; non-array `parameters`/`bindings`; any bad
 * parameter or rule reported by the helpers above. Workflow ids are object
 * keys (unique by construction), so only a non-empty id is checkable here.
 * @param value - Untrusted spec
 * @param path - Error prefix
 * @param errors - Accumulator
 */
function specErrors(value: unknown, path: string, errors: string[],): void {
  const spec = objectOrNull(value,);
  if (spec === null) {
    errors.push(`${path}: expected an object`,);
    return;
  }

  if (spec.parameters !== undefined) {
    if (!Array.isArray(spec.parameters,)) {
      errors.push(`${path}.parameters: expected an array`,);
    } else {
      const seen = new Set<string>();
      spec.parameters.forEach((parameter, index,) => {
        parameterErrors(parameter, `${path}.parameters[${index}]`, seen, errors,);
      },);
    }
  }

  if (!Array.isArray(spec.bindings,)) {
    errors.push(`${path}.bindings: expected an array`,);
    return;
  }

  spec.bindings.forEach((rule, index,) => {
    ruleErrors(rule, `${path}.bindings[${index}]`, errors,);
  },);
}

/**
 * Validate an untrusted binding config without throwing.
 *
 * Collects every error found across all workflows; the cast on success is
 * safe because every field above has been checked.
 * @param value - Untrusted config (typically parsed JSON)
 * @returns The validated config or all validation errors
 */
export function parseWorkflowBindings(
  value: unknown,
): { ok: true; config: WorkflowBindingConfig } | { ok: false; errors: string[] } {
  const root = objectOrNull(value,);
  if (root === null) {
    return { ok: false, errors: ["root: expected an object",], };
  }

  const errors: string[] = [];
  if (root.schemaVersion !== 1) {
    errors.push("schemaVersion: expected 1",);
  }

  if (root.bindingPolicy !== "augment" && root.bindingPolicy !== "explicit") {
    errors.push('bindingPolicy: expected "augment" or "explicit"',);
  }

  const snapshot = objectOrNull(root.snapshot,);
  if (snapshot === null) {
    errors.push("snapshot: expected an object",);
  } else {
    const digest = snapshot.objectInfoSha256;
    if (typeof digest !== "string" || !SHA256_RE.test(digest,)) {
      errors.push(
        'snapshot.objectInfoSha256: expected 64 hex characters, optionally prefixed with "sha256:"',
      );
    }

    if (snapshot.source !== undefined && typeof snapshot.source !== "string") {
      errors.push("snapshot.source: expected a string",);
    }
  }

  const workflows = objectOrNull(root.workflows,);
  if (workflows === null) {
    errors.push("workflows: expected an object keyed by workflow id",);
  } else {
    const seenIds = new Set<string>();
    for (const [id, spec,] of Object.entries(workflows,)) {
      if (!isName(id,)) {
        errors.push("workflows: workflow id must be a non-empty string",);
      } else if (seenIds.has(id,)) {
        errors.push(`workflows: duplicate workflow id "${id}"`,);
      }

      seenIds.add(id,);
      specErrors(spec, `workflows.${id}`, errors,);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, };
  }

  return { ok: true, config: root as unknown as WorkflowBindingConfig, };
}

/**
 * Validate an untrusted single-workflow binding spec.
 * @param value - Untrusted spec
 * @returns The normalized spec or every error found
 */
export function parseWorkflowBindingSpec(
  value: unknown,
): { ok: true; spec: WorkflowBindingSpec } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  specErrors(value, "bindings", errors,);
  if (errors.length > 0) { return { ok: false, errors, }; }
  return { ok: true, spec: value as WorkflowBindingSpec, };
}

/**
 * Resolve every rule target against a graph using synthetic values.
 *
 * `planWorkflowBindings` already fails closed on unknown nodes, ambiguous
 * class types and targets that no longer hold their `{{placeholder}}`; feeding
 * it the placeholder names as values exercises those checks without a request.
 * @param spec - Validated binding spec
 * @param graph - Graph the spec will bind against
 * @returns All target errors, or an empty list
 */
export function validateBindingTargets(spec: WorkflowBindingSpec, graph: ComfyUIWorkflow,): string[] {
  const params: Record<string, unknown> = {};
  for (const rule of spec.bindings) {
    if (rule.kind === "scalar") {
      params[rule.parameter] = rule.parameter;
      continue;
    }

    const start = rule.startIndex ?? DEFAULT_START_INDEX;
    const max = rule.maxItems ?? DEFAULT_MAX_ITEMS;
    params[rule.parameter] = Array.from(
      { length: max, },
      (_, index,) => rule.emitAs.replaceAll(INDEX_TOKEN, String(start + index,),),
    );
  }

  const planned = planWorkflowBindings(spec, graph, params,);
  return planned.ok ? [] : planned.errors;
}

/**
 * Every placeholder name a spec can emit, in rule order: scalar parameter
 * names, and each fanout `emitAs` expanded over its configured index range
 * (defaults: startIndex 0, maxItems 4).
 * @param spec - Validated (or structurally correct) spec
 * @returns Placeholder names
 */
export function bindingPlaceholders(spec: WorkflowBindingSpec,): string[] {
  const names: string[] = [];
  for (const rule of spec.bindings) {
    if (rule.kind === "scalar") {
      names.push(rule.parameter,);
      continue;
    }

    const start = rule.startIndex ?? DEFAULT_START_INDEX;
    const max = rule.maxItems ?? DEFAULT_MAX_ITEMS;
    for (let index = start; index < start + max; index += 1) {
      names.push(rule.emitAs.replaceAll(INDEX_TOKEN, String(index,),),);
    }
  }

  return names;
}

/**
 * Resolve a target to an existing node and confirm its input still holds the
 * exact `{{placeholder}}`. Error paths: unknown node id; zero or multiple
 * class-type matches; missing input; placeholder replaced by another value.
 * @param target - Node id or class type plus input name
 * @param graph - Workflow graph
 * @param placeholder - Name inside the double braces
 * @param path - Error prefix
 * @param errors - Accumulator
 * @returns The resolved node id, or null when the target is unusable
 */
function resolveTarget(
  target: BindingTarget,
  graph: ComfyUIWorkflow,
  placeholder: string,
  path: string,
  errors: string[],
): string | null {
  let nodeId: string;
  if ("node" in target) {
    nodeId = target.node;
    if (!Object.hasOwn(graph, nodeId,)) {
      errors.push(`${path}: unknown node "${nodeId}"`,);
      return null;
    }
  } else {
    const matches = Object.entries(graph,)
      .filter(([, node,],) => node?.class_type === target.classType)
      .map(([id,],) => id);

    const only = matches[0];
    if (matches.length !== 1 || only === undefined) {
      errors.push(
        matches.length === 0
          ? `${path}: no node with classType "${target.classType}"`
          : `${path}: ambiguous classType "${target.classType}" matches ${matches.length} nodes (${
            matches.join(", ",)
          })`,
      );

      return null;
    }

    nodeId = only;
  }

  const node = graph[nodeId];
  if (node === undefined) {
    errors.push(`${path}: unknown node "${nodeId}"`,);
    return null;
  }

  if (
    typeof node.inputs !== "object" || node.inputs === null ||
    !Object.hasOwn(node.inputs, target.input,)
  ) {
    errors.push(`${path}: node "${nodeId}" has no input "${target.input}"`,);
    return null;
  }

  const expected = `{{${placeholder}}}`;
  if (node.inputs[target.input] !== expected) {
    errors.push(
      `${path}: node "${nodeId}" input "${target.input}" holds ${
        String(node.inputs[target.input],)
      }, expected ${expected} (fail-closed)`,
    );

    return null;
  }

  return nodeId;
}

/**
 * Build substitution vars for a spec against a concrete graph and request.
 *
 * Errors are collected across all rules: unknown/ambiguous targets, missing
 * placeholders, non-primitive scalar values, non-array fanout values,
 * non-primitive fanout items, and unused fanout targets when
 * `onUnusedTarget` is "error". "leave" (the default) skips unused targets.
 * @param spec - Binding spec
 * @param graph - Workflow graph to bind against
 * @param params - Request parameters
 * @returns The accumulated vars or all binding errors
 */
export function planWorkflowBindings(
  spec: WorkflowBindingSpec,
  graph: ComfyUIWorkflow,
  params: Readonly<Record<string, unknown>>,
): { ok: true; vars: SubstitutionVars } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const vars: SubstitutionVars = {};

  for (const rule of spec.bindings) {
    if (rule.kind === "scalar") {
      const path = `scalar "${rule.parameter}"`;
      if (resolveTarget(rule.target, graph, rule.parameter, path, errors,) === null) {
        continue;
      }

      const value = params[rule.parameter];
      if (!isPrimitive(value,)) {
        errors.push(`${path}: expected a string, number or boolean value`,);
        continue;
      }

      vars[rule.parameter] = value;
      continue;
    }

    const path = `fanout "${rule.parameter}"`;
    const raw = params[rule.parameter];
    let items: readonly unknown[] = [];
    if (raw !== undefined) {
      if (!Array.isArray(raw,)) {
        errors.push(`${path}: expected an array`,);
      } else {
        items = raw;
      }
    }

    const start = rule.startIndex ?? DEFAULT_START_INDEX;
    const max = rule.maxItems ?? DEFAULT_MAX_ITEMS;
    for (let index = start; index < start + max; index += 1) {
      const name = rule.emitAs.replaceAll(INDEX_TOKEN, String(index,),);
      const node = rule.targetTemplate.node.replaceAll(INDEX_TOKEN, String(index,),);
      const itemPath = `${path}[${index}]`;
      if (
        resolveTarget(
          { node, input: rule.targetTemplate.input, },
          graph,
          name,
          itemPath,
          errors,
        ) === null
      ) {
        continue;
      }

      const itemIndex = index - start;
      if (itemIndex < 0 || itemIndex >= items.length) {
        if (rule.onUnusedTarget === "error") {
          errors.push(`${itemPath}: unused target with no value (onUnusedTarget="error")`,);
        }

        continue;
      }

      const item = items[itemIndex];
      if (!isPrimitive(item,)) {
        errors.push(`${itemPath}: item ${itemIndex} must be a string, number or boolean`,);
        continue;
      }

      vars[name] = item;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, };
  }

  return { ok: true, vars, };
}
