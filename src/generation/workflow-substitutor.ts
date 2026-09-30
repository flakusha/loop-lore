// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow Substitutor — Template variable replacement in ComfyUI workflow JSON
 *
 * Deep-walks workflow JSON and replaces `{{variable}}` placeholders with
 * values from a substitution map. A placeholder that is the *whole* string
 * yields the variable's own type; a placeholder mixed with other text yields
 * a string. Node-targeted overrides are a separate mechanism — see
 * {@link applyNodeOverrides}.
 * @module workflow-substitutor
 */

/** Substitution map: variable name → replacement value */
export type SubstitutionVars = Record<string, string | number | boolean>;

/** What a single string input can become after substitution. */
export type SubstitutionValue = string | number | boolean;

/**
 * The substituted shape of `T`.
 *
 * A string leaf widens because a whole-string `{{var}}` yields the variable's
 * own type, so `"{{width}}"` can come back a number. Every other leaf is
 * returned untouched, hence the identity branches.
 */
export type Substituted<T,> = T extends string ? SubstitutionValue
  : T extends readonly unknown[] ? { [K in keyof T]: Substituted<T[K]> }
  : T extends object ? { [K in keyof T]: Substituted<T[K]> }
  : T;

/** Match pattern for a {{variable}} anywhere in a string */
const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/** Match pattern for a string that is *exactly* one {{variable}} */
const WHOLE_PLACEHOLDER_RE = /^\{\{([^}]+)\}\}$/;

/**
 * Every `{{placeholder}}` name appearing anywhere in a JSON-compatible value.
 *
 * Shares PLACEHOLDER_RE with the substitutor on purpose: workflow ingest
 * validation checks that a declared parameter actually appears in the graph,
 * and a second copy of this regex would eventually disagree with the one that
 * actually does the substituting.
 * @param obj - JSON value to scan
 * @returns {Set<string>}
 */
export function collectPlaceholders(obj: unknown,): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown,): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(PLACEHOLDER_RE,)) {
        found.add(match[1]!.trim(),);
      }
      return;
    }
    if (Array.isArray(value,)) {
      for (const item of value) { walk(item,); }
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const nested of Object.values(value,)) { walk(nested,); }
    }
  };
  walk(obj,);
  return found;
}

/**
 * Deep-clone and substitute placeholders in a JSON-compatible value.
 *
 * Strings containing `{{...}}` are processed. All other types pass through unchanged.
 * @param obj - JSON value to process (object, array, string, number, boolean, null)
 * @param vars - Variable map for simple replacements
 * @param nodeOverrides - Optional node-targeted overrides (nodeId → field path → value)
 * @param _nodeOverrides
 * @returns New object with placeholders replaced; string leaves may widen to
 *   the substituted variable's own type
 */
export function substituteWorkflow<T,>(
  obj: T,
  vars: SubstitutionVars,
  _nodeOverrides?: Map<string, Record<string, unknown>>,
): Substituted<T> {
  if (obj === null || obj === undefined) { return obj as Substituted<T>; }

  if (typeof obj === "string") {
    return substituteValue(obj, vars,) as Substituted<T>;
  }

  if (Array.isArray(obj,)) {
    return Array.from(obj, (item,) => substituteWorkflow(item, vars, _nodeOverrides,),) as Substituted<T>;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value,] of Object.entries(obj as Record<string, unknown>,)) {
      result[key] = substituteWorkflow(value, vars, _nodeOverrides,);
    }
    return result as Substituted<T>;
  }

  // Numbers, booleans, null — pass through
  return obj as Substituted<T>;
}

/**
 * Substitute a single string value.
 *
 * Handles:
 * - `"{{prompt}}"` → full replacement (returns non-string if value is number/boolean)
 * - `"a {{prompt}} b"` → string interpolation
 * - `"{{a}}{{b}}"` → multiple replacements
 * - Unknown variables → empty string
 * Preserves the variable's type when the placeholder is the entire string.
 * `"{{width}}"` with `width: 768` must yield the number `768`, not `"768"` —
 * ComfyUI node inputs like width/seed/steps/cfg_scale are numeric, and a
 * stringified numeric is rejected or silently coerced at submit time. Mixed
 * content (`"a {{prompt}} b"`) has no single type to preserve, so it interpolates.
 *
 * @param str - String containing `{{...}}` placeholders
 * @param vars - Variable map
 * @returns The typed value, or a string when interpolating
 */
function substituteValue(str: string, vars: SubstitutionVars,): string | number | boolean {
  // Fast path: no placeholders
  if (!str.includes("{{",)) { return str; }

  const whole = WHOLE_PLACEHOLDER_RE.exec(str,);
  if (whole) {
    const key = whole[1]!.trim();
    // Unknown variable → empty string (preserves workflow structure)
    return key in vars ? vars[key]! : "";
  }

  return str.replaceAll(PLACEHOLDER_RE, (_match, path,) => {
    const key = path.trim();
    return key in vars ? String(vars[key],) : "";
  },);
}

/**
 * Apply node-targeted overrides to a workflow object.
 *
 * Node overrides allow setting specific node input values directly,
 * bypassing the template substitution. Useful when the caller knows
 * exactly which node to target (e.g., "node 5 inputs.text = my prompt").
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
 * @param params - Generation parameters from the request
 * @param params.prompt
 * @param params.negativePrompt
 * @param params.width
 * @param params.height
 * @param params.steps
 * @param params.cfgScale
 * @param params.sampler
 * @param params.seed
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
