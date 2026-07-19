// src/config/generate-toml-schema.ts — Generate TOML-optimized JSON Schema
//
// Usage: bun run src/config/generate-toml-schema.ts
// Outputs: schemas/loop-lore-config.toml.schema.json
//
// Produces a JSON Schema optimized for TOML language servers (Taplo, Even Better
// TOML, Tombi). These servers validate TOML documents against JSON Schema, using
// the $schema key in the TOML document root.
//
// Differences from the base JSON Schema:
//   - Adds x-toml annotations for array-of-tables hints
//   - Ensures all arrays have full items definitions
//   - Adds examples for TOML-specific syntax (inline tables, array-of-tables)

import { writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { ConfigSchema, } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

type JSONSchema = Record<string, unknown>;

/**
 * Annotate array schemas with TOML-specific hints.
 *
 * TOML language servers use these to provide correct autocompletion:
 * - Array of scalars → `items: { type: "string" }` etc.
 * - Array of objects (array-of-tables `[[key]]`) → full items schema
 */
function annotateForToml(schema: JSONSchema,): JSONSchema {
  const result: JSONSchema = { ...schema, };

  if (typeof result.properties !== "object" || result.properties === null) {
    return annotateNested(result,);
  }

  for (const [key, propSchema,] of Object.entries(result.properties as Record<string, JSONSchema>,)) {
    if (typeof propSchema !== "object" || propSchema === null) { continue; }

    (result.properties as Record<string, JSONSchema>)[key] = annotateForToml(propSchema,);

    // Add TOML array-of-tables hint for arrays of objects
    const items = propSchema.items as JSONSchema | undefined;
    if (propSchema.type === "array" && items?.type === "object") {
      (result.properties as Record<string, JSONSchema>)[key] = {
        ...propSchema,
        "x-toml-kind": "array-of-tables",
      };
    }
  }

  return result;
}

/** Annotate nested items and additionalProperties in a schema node. */
function annotateNested(schema: JSONSchema,): JSONSchema {
  const result: JSONSchema = { ...schema, };

  if (result.type === "array" && typeof result.items === "object" && result.items !== null) {
    result.items = annotateForToml(result.items as JSONSchema,);
  }

  if (typeof result.additionalProperties === "object" && result.additionalProperties !== null) {
    result.additionalProperties = annotateForToml(result.additionalProperties as JSONSchema,);
  }

  return result;
}

/**
 * Ensure all array types have items definitions.
 * TOML LSP needs items to provide autocompletion.
 */
function ensureArrayItems(schema: JSONSchema,): JSONSchema {
  const result: JSONSchema = { ...schema, };

  if (result.type === "array" && !result.items) {
    result.items = { type: "string", };
  }

  if (typeof result.properties === "object" && result.properties !== null) {
    for (const [key, propSchema,] of Object.entries(result.properties as Record<string, JSONSchema>,)) {
      if (typeof propSchema === "object" && propSchema !== null) {
        (result.properties as Record<string, JSONSchema>)[key] = ensureArrayItems(propSchema,);
      }
    }
  }

  if (result.type === "array" && typeof result.items === "object" && result.items !== null) {
    result.items = ensureArrayItems(result.items as JSONSchema,);
  }

  if (typeof result.additionalProperties === "object" && result.additionalProperties !== null) {
    result.additionalProperties = ensureArrayItems(result.additionalProperties as JSONSchema,);
  }

  return result;
}

function main() {
  // Start from the base JSON Schema
  const baseSchema = ConfigSchema.jsonSchema();

  // Apply TOML optimizations
  let tomlSchema = ensureArrayItems(baseSchema,);
  tomlSchema = annotateForToml(tomlSchema,);

  // Update metadata for TOML-specific schema
  tomlSchema.$id = "./schemas/loop-lore-config.toml.schema.json";
  tomlSchema.title = "loop-lore Config (TOML-optimized)";
  tomlSchema.description = "JSON Schema optimized for TOML language servers (Taplo, Even Better TOML, Tombi)." +
    " Reference from config.toml via $schema key.";

  const outputPath = `${__dirname}/../../schemas/loop-lore-config.toml.schema.json`;
  try {
    const r = safeJsonStringify(tomlSchema, 2,);
    writeFileSync(outputPath, r.ok ? r.value : "{}",);
    log.info(`Generated TOML schema: ${outputPath}`,);
  } catch (error) {
    log.error(`Failed to write TOML schema: ${error instanceof Error ? error.message : String(error,)}`,);
    process.exit(1,);
  }
}

main();
