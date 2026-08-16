#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// scripts/fix-schemas.ts — Regenerate all generated schema files
//
// Writes:
//   - schemas/loop-lore-config.schema.json
//   - schemas/env-map.snapshot.json

import { mkdirSync, writeFileSync, } from "node:fs";
import { dirname, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";
import { ConfigSchema, } from "../src/config/schema-class";
import { safeJsonStringify, } from "../src/utils";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const ROOT = resolve(__dirname, "..",);
const schemasDir = resolve(ROOT, "schemas",);

function toJson(value: unknown,): string {
  const result = safeJsonStringify(value, 2,);
  return result.ok ? result.value : "{}";
}

mkdirSync(schemasDir, { recursive: true, },);

const jsonSchemaPath = resolve(schemasDir, "loop-lore-config.schema.json",);
writeFileSync(jsonSchemaPath, toJson(ConfigSchema.jsonSchema(),),);
console.log(`✓ Written: ${jsonSchemaPath}`,);

const envMapPath = resolve(schemasDir, "env-map.snapshot.json",);
writeFileSync(envMapPath, toJson(ConfigSchema.envMap(),),);
console.log(`✓ Written: ${envMapPath}`,);
