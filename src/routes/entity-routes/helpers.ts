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
    const val = body[camel] ?? config.defaults[camel];
    if (val != null) {
      values[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(val,) : val;
    }
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
    if (body[camel] != null) {
      updates[col] = config.jsonFields.includes(camel,) ? jsonStringifyOr(body[camel],) : body[camel];
    }
  }
  updates.updated_at = new Date().toISOString();
  return updates;
}
