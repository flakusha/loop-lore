/**
 * Character Schema — JSON Schema generation
 *
 * Generates JSON Schema from the CanonicalCharacter type definition
 * for LSP/IDE support and validation.
 *
 * Usage: bun run src/config/generate-character-schema.ts
 * Outputs: schemas/character-card.schema.json
 */

import { writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { dataProperties, } from "./data-core.js";
import { extensionsProperties, } from "./extensions.js";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

export function characterJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft-2020-12/schema",
    $id: "./schemas/character-card.schema.json",
    title: "Loop-Lore Character Card",
    description:
      "Canonical character card schema for loop-lore. Auto-generated from src/characters/spec.ts. Do not edit manually.",
    type: "object",
    required: ["name", "description", "personality",],
    properties: {
      spec: {
        type: "string",
        const: "loop-lore/v1",
        description: "Spec version identifier",
      },
      data: {
        type: "object",
        required: ["name", "description", "personality",],
        properties: {
          ...dataProperties,
          extensions: extensionsProperties,
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

function main() {
  const schema = characterJsonSchema();
  const outputPath = `${__dirname}/../../../schemas/character-card.schema.json`;
  try {
    const r = safeJsonStringify(schema, 2,);
    writeFileSync(outputPath, r.ok ? r.value : "{}",);
    log.info(`Generated character schema: ${outputPath}`,);
  } catch (error) {
    log.fatal(`Failed to write schema: ${error instanceof Error ? error.message : String(error,)}`,);
    process.exit(1,);
  }
}

main();
