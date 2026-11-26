// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/generate-env-schema.ts — Generate JSON Schema for env.yaml files
//
// Usage: bun run config:generate-env-schema
// Outputs: schemas/env.schema.json (single source: envJsonSchema() in schema-class)

import { mkdirSync, writeFileSync, } from "node:fs";
import { dirname, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../logger";
import { safeJsonStringify, } from "../utils/safe-json";
import { envJsonSchema, } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

/** */
function main(): void {
  const outputPath = resolve(__dirname, "..", "..", "..", "..", "schemas", "env.schema.json",);
  try {
    mkdirSync(dirname(outputPath,), { recursive: true, },);
    const r = safeJsonStringify(envJsonSchema(), 2,);
    writeFileSync(outputPath, r.ok ? r.value : "{}",);
    log.info(`Generated env schema: ${outputPath}`,);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    process.stderr.write(`Failed to write env schema: ${message}\n`,);
    log.fatal(`Failed to write env schema: ${message}`,);
    process.exit(1,);
  }
}

main();
