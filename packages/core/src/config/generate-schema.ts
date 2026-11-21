// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/generate-schema.ts — Generate JSON Schema from ConfigSchema
//
// Usage: bun run src/config/generate-schema.ts
// Outputs: schemas/loop-lore-config.schema.json
//
// Single source of truth: jsonSchema() in schema-class.
// Add new config params there — this file auto-generates from it.

import { createLogger, } from "@/logger";
import { safeJsonStringify, } from "@/utils";
import { mkdirSync, writeFileSync, } from "node:fs";
import { dirname, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";
import { jsonSchema, } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

/** */
function main() {
  const schema = jsonSchema();
  const outputPath = resolve(__dirname, "..", "..", "..", "..", "schemas", "loop-lore-config.schema.json",);
  try {
    mkdirSync(dirname(outputPath,), { recursive: true, },);
    const r = safeJsonStringify(schema, 2,);
    writeFileSync(outputPath, r.ok ? r.value : "{}",);
    log.info(`Generated schema: ${outputPath}`,);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    process.stderr.write(`Failed to write schema: ${message}\n`,);
    log.fatal(`Failed to write schema: ${message}`,);
    process.exit(1,);
  }
}

main();
