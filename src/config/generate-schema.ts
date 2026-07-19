// src/config/generate-schema.ts — Generate JSON Schema from ConfigSchema
//
// Usage: bun run src/config/generate-schema.ts
// Outputs: schemas/loop-lore-config.schema.json
//
// Single source of truth: ConfigSchema.jsonSchema() in schema-class.ts.
// Add new config params there — this file auto-generates from it.

import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logger";
import { safeJsonStringify } from "../utils";
import { ConfigSchema } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger({ level: "info" });

function main() {
  const schema = ConfigSchema.jsonSchema();
  const outputPath = `${__dirname}/../../schemas/loop-lore-config.schema.json`;
  try {
    const r = safeJsonStringify(schema, 2);
    writeFileSync(outputPath, r.ok ? r.value : "{}");
    log.info(`Generated schema: ${outputPath}`);
  } catch (error) {
    log.error(`Failed to write schema: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
