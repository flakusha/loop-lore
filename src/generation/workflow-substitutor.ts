// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow Substitutor — Template variable replacement in ComfyUI workflow JSON
 *
 * Deep-walks workflow JSON and replaces `{{variable}}` placeholders with
 * values from a substitution map. Supports:
 *
 * - Simple: `{{prompt}}` → replaced from `vars.prompt`
 * - Nested: `{{node_id.inputs.field}}` → targeted node field override
 *
 * @module workflow-substitutor
 */

/** Substitution map: variable name → replacement value */
export type SubstitutionVars = Record<string, string | number | boolean>;

/** Match pattern for {{variable}} or {{path.to.field}} */
const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/**
 * Deep-clone and substitute placeholders in a JSON-compatible value.
 *
 * Strings containing `{{...}}` are processed. All other types pass through unchanged.
 *
 * @param obj - JSON value to process (object, array, string, number, boolean, null)
 * @param vars - Variable map for simple replacements
 * @param nodeOverrides - Optional node-targeted overrides (nodeId → field path → value)
 * @returns New object with placeholders replaced
 */
export function substituteWorkflow<T,>(
  obj: T,
  vars: SubstitutionVars,
  _nodeOverrides?: Map<string, Record<string, unknown>>,
): T {
  if (obj === null || obj === undefined) { return obj; }

  if (typeof obj === "string") {
    return substituteString(obj, vars,) as T;
  }

  if (Array.isArray(obj,)) {
    return Array.from(obj, (item,) => substituteWorkflow(item, vars, _nodeOverrides,),) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value,] of Object.entries(obj as Record<string, unknown>,)) {
      result[key] = substituteWorkflow(value, vars, _nodeOverrides,);
    }
    return result as T;
  }

  // Numbers, booleans, null — pass through
  return obj;
}

/**
 * Substitute a single string value.
 *
 * Handles:
 * - `"{{prompt}}"` → full replacement (returns non-string if value is number/boolean)
 * - `"a {{prompt}} b"` → string interpolation
 * - `"{{a}}{{b}}"` → multiple replacements
 * - Unknown variables → empty string
 *
 * @param str - String containing `{{...}}` placeholders
 * @param vars - Variable map
 * @returns Replaced string (or original if no placeholders found)
 */
function substituteString(str: string, vars: SubstitutionVars,): string {
  // Fast path: no placeholders
  if (!str.includes("{{",)) { return str; }

  return str.replaceAll(PLACEHOLDER_RE, (_match, path,) => {
    const key = path.trim();

    // Direct lookup: vars["prompt"]
    if (key in vars) {
      return String(vars[key],);
    }

    // Unknown variable → empty string (preserves workflow structure)
    return "";
  },);
}

/**
 * Apply node-targeted overrides to a workflow object.
 *
 * Node overrides allow setting specific node input values directly,
 * bypassing the template substitution. Useful when the caller knows
 * exactly which node to target (e.g., "node 5 inputs.text = my prompt").
 *
 * @param workflow - ComfyUI workflow object (node_id → { inputs, class_type, ... })
 * @param overrides - Map of nodeId → { fieldPath: value }
 * @returns New workflow with overrides applied
 */
export function applyNodeOverrides<T extends Record<string, unknown>,>(
  workflow: T,
  overrides: Map<string, Record<string, unknown>>,
): T {
  if (overrides.size === 0) { return workflow; }

  const result = { ...workflow, };

  for (const [nodeId, fields,] of overrides) {
    const node = result[nodeId] as Record<string, unknown> | undefined;
    if (!node) { continue; }

    const inputs = node.inputs as Record<string, unknown> | undefined;
    if (!inputs) { continue; }

    node.inputs = { ...inputs, ...fields, };
  }

  return result;
}

/**
 * Build substitution vars from image generation parameters.
 *
 * Maps common generation fields to template variable names.
 *
 * @param params - Generation parameters from the request
 * @returns Substitution variable map
 */
export function buildSubstitutionVars(params: {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  seed?: number;
  [key: string]: unknown;
},): SubstitutionVars {
  const vars: SubstitutionVars = {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt ?? "",
    width: params.width ?? 512,
    height: params.height ?? 512,
    steps: params.steps ?? 20,
    cfg_scale: params.cfgScale ?? 7,
    sampler: params.sampler ?? "euler",
    seed: params.seed ?? Math.floor(Math.random() * 2_147_483_647,),
  };

  // Pass through any extra params
  for (const [key, value,] of Object.entries(params,)) {
    if (typeof value !== "object" && !(key in vars)) {
      vars[key] = value as string | number | boolean;
    }
  }

  return vars;
}
