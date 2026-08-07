/**
 * PII censoring engine — field-name pattern matching with recursive walk.
 */

import type { CensorRule, } from "./types";

/** Built-in default rules active when censoring enabled */
export const DEFAULT_RULES: CensorRule[] = [
  { field: "*key*", },
  { field: "*token*", },
  { field: "*secret*", },
  { field: "*password*", },
  { field: "*authorization*", },
  { field: "*credential*", },
  { field: "email", },
  { field: "ssn", },
  { field: "phone", },
  { field: "*api*key*", },
];

const PLACEHOLDER = "[REDACTED]";

/**
 * Simple glob match (case-insensitive).
 * Supports: "exact", "prefix*", "*suffix", "*contains*"
 */
function isGlobMatch(pattern: string, value: string,): boolean {
  const lowerPattern = pattern.toLowerCase();
  const lowerValue = value.toLowerCase();

  if (lowerPattern.startsWith("*",) && lowerPattern.endsWith("*",)) {
    return lowerValue.includes(lowerPattern.slice(1, -1,),);
  }
  if (lowerPattern.startsWith("*",)) {
    return lowerValue.endsWith(lowerPattern.slice(1,),);
  }
  if (lowerPattern.endsWith("*",)) {
    return lowerValue.startsWith(lowerPattern.slice(0, -1,),);
  }
  return lowerValue === lowerPattern;
}

/**
 * Check if a key matches any censor rule.
 * Returns the matching rule or undefined.
 */
function matchRule(key: string, rules: CensorRule[],): CensorRule | undefined {
  return rules.find((r,) => isGlobMatch(r.field, key,));
}

/**
 * Recursively walk a value and censor matching fields.
 */
function censorScalar(val: unknown, rule: CensorRule,): unknown {
  if (rule.pattern && typeof val === "string") {
    return rule.pattern.test(val,) ? (rule.replacement ?? PLACEHOLDER) : val;
  }
  return rule.replacement ?? PLACEHOLDER;
}

function censorObject(
  obj: Record<string, unknown>,
  rules: CensorRule[],
  depth: number,
  maxDepth: number,
): Record<string, unknown> {
  if (depth > maxDepth) { return obj; }
  const result: Record<string, unknown> = {};
  for (const [key, val,] of Object.entries(obj,)) {
    const rule = matchRule(key, rules,);
    if (rule) {
      result[key] = censorScalar(val, rule,);
    } else if (val !== null && typeof val === "object" && !Array.isArray(val,)) {
      result[key] = censorObject(val as Record<string, unknown>, rules, depth + 1, maxDepth,);
    } else if (Array.isArray(val,)) {
      result[key] = Array.from(val, (item: unknown,) =>
        typeof item === "object" && item !== null
          ? censorObject(item as Record<string, unknown>, rules, depth + 1, maxDepth,)
          : item,);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function censorValue(value: unknown, rules: CensorRule[], depth: number, maxDepth: number,): unknown {
  if (depth > maxDepth || value === null || value === undefined) { return value; }

  if (Array.isArray(value,)) {
    return Array.from(value, (item: unknown,) => censorValue(item, rules, depth, maxDepth,),);
  }

  if (typeof value === "object") {
    return censorObject(value as Record<string, unknown>, rules, depth, maxDepth,);
  }

  return value;
}

export interface CensorMetaOpts {
  meta: Record<string, unknown> | undefined;
  extraRules?: CensorRule[];
  maxDepth?: number;
}

/**
 * Censor PII in a metadata object.
 * Returns a new object, does not mutate input.
 */
export function censorMeta({
  meta,
  extraRules,
  maxDepth = 5,
}: CensorMetaOpts,): Record<string, unknown> | undefined {
  if (!meta) { return meta; }
  const rules = extraRules?.length ? [...DEFAULT_RULES, ...extraRules,] : DEFAULT_RULES;
  return censorValue(meta, rules, 0, maxDepth,) as Record<string, unknown>;
}

/**
 * Convert extra field name strings to CensorRule objects.
 */
export function fieldNamesToRules(fields: string[],): CensorRule[] {
  return Array.from(fields, (f,) => ({ field: f, }),);
}
