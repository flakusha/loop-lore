import { jsonStringifyOr, uid, } from "../../utils";
import type { EntityConfig, } from "./types";

export function buildCreateValues({
  config,
  parentId,
  body,
}: {
  config: EntityConfig;
  parentId: string;
  body: Record<string, unknown>;
},): Record<string, unknown> {
  const values: Record<string, unknown> = {
    id: uid(),
    [config.parentFk]: parentId,
  };
  for (const [camel, col,] of Object.entries(config.fieldMappings,)) {
    const raw = body[camel] ?? config.defaults[camel];
    if (raw == null) { continue; }
    const val = config.valueTransforms?.[camel] ? config.valueTransforms[camel](raw,) : raw;
    values[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(val,) : val;
  }
  return values;
}

export function buildUpdateValues({
  config,
  body,
}: {
  config: EntityConfig;
  body: Record<string, unknown>;
},): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [camel, col,] of Object.entries(config.fieldMappings,)) {
    if (body[camel] == null) {
      continue;
    }

    const val = config.valueTransforms?.[camel] ? config.valueTransforms[camel](body[camel],) : body[camel];
    updates[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(val,) : val;
  }
  updates.updated_at = new Date().toISOString();
  return updates;
}

/** Map snake_case DB rows back to camelCase API shapes, applying responseTransforms. */
export function applyResponseTransforms(
  config: EntityConfig,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [camel, col,] of Object.entries(config.fieldMappings,)) {
    if (row[col] === undefined) {
      continue;
    }

    const val = config.responseTransforms?.[camel] ? config.responseTransforms[camel](row[col],) : row[col];
    out[camel] = config.jsonFields.includes(camel,) ? row[col] : val;
  }
  for (const [key, val,] of Object.entries(row,)) {
    if (!(key in config.fieldMappings)) {
      out[key] = val;
    }
  }
  return out;
}
