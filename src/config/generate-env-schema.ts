// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/generate-env-schema.ts — Generate JSON Schema for env.yaml files
//
// Usage: bun run config:generate-env-schema
// Outputs: schemas/env.schema.json (single source: envJsonSchema() in schema-class)

import { writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { envJsonSchema, } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

/** */
function main(): void {
  const outputPath = `${__dirname}/../../schemas/env.schema.json`;
  const r = safeJsonStringify(envJsonSchema(), 2,);
  writeFileSync(outputPath, r.ok ? r.value : "{}",);
  log.info(`Generated env schema: ${outputPath}`,);
}

main();
