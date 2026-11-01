// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/env-schema.ts — JSON Schema for env.yaml files
//
// Consumed by src/config/generate-env-schema.ts and scripts/check-schemas.ts.
// Generated artifact: schemas/env.schema.json (staleness gate: bun run schemas:check).
//
// env.yaml accepts two shapes (both merged into the config pipeline by
// src/config/load/load.ts step 4 + liftFlatEnvKeys):
//   1. Flat ENV_MAP keys   — e.g. `PORT: 3000` (see schemas/env-map.snapshot.json)
//   2. Nested config paths — e.g. `server: { port: 3000 }` (same shape as config.yaml)
//
// Everything is optional (an override file), and "$schema" itself is allowed
// (editors embed it in the document root).

import { getTypeOfPath, } from "../load/parse";
import { createConfigSchema, envMap, jsonSchema, } from "./index";

/**
 * Runtime scalar type (from getTypeOfPath) → JSON Schema type(s).
 * @param runtime Type name reported by getTypeOfPath.
 * @returns JSON Schema type or union of accepted types.
 */
function jsonType(runtime: string,): string | string[] {
  switch (runtime) {
    case "number":
      return ["number", "string",]; // coerceValue accepts numeric strings
    case "boolean":
      return ["boolean", "string",]; // coerceValue accepts "true"/"false"
    case "bigint":
      return ["integer", "string",];
    default:
      return "string";
  }
}

/**
 * Build the env.yaml JSON Schema document.
 * @returns Root JSON Schema for env.yaml override files (flat + nested shapes).
 */
export const envJsonSchema = (): Record<string, unknown> => {
  const full = jsonSchema();
  const fullProps = full.properties as Record<string, unknown>;

  // ── Nested shape: reuse the config schema sections verbatim, all optional ──
  const nestedProperties: Record<string, unknown> = {};
  for (const [section, meta,] of Object.entries(fullProps,)) {
    const optional = { ...(meta as Record<string, unknown>), };
    delete optional.required;
    nestedProperties[section] = optional;
  }

  // ── Flat ENV_MAP keys, typed against the section defaults ──
  const defaults = createConfigSchema().defaults as unknown as Record<string, unknown>;
  const flatProperties: Record<string, unknown> = {};
  for (const [envVar, configPath,] of Object.entries(envMap(),)) {
    if (flatProperties[envVar] !== undefined) { continue; } // first wins, mirrors ENV_MAP iteration
    flatProperties[envVar] = {
      description: `Flat override for config path: ${configPath}`,
      type: jsonType(getTypeOfPath(defaults, configPath,),),
    };
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "./schemas/env.schema.json",
    title: "loop-lore env.yaml",
    description:
      "Environment override file. Accepts flat ENV_MAP keys (PORT: 3000) and nested config paths (server: { port: 3000 }).",
    type: "object",
    properties: {
      $schema: { type: "string", },
      ...flatProperties,
      ...nestedProperties,
    },
    // Flat + nested allowed side by side (deepMerge order: flat hoisted first).
    additionalProperties: true,
  };
};
