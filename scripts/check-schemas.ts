#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// scripts/check-schemas.ts — Verify generated schemas are up-to-date
//
// Regenerates:
//   - schemas/loop-lore-config.schema.json (from ConfigSchema.jsonSchema())
//   - ENV_MAP snapshot (from ConfigSchema.envMap())
//
// Exits non-zero if any generated file is stale (for pre-commit gate).

import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { dirname, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";
import { ConfigSchema, } from "../src/config/schema-class";
import { safeJsonStringify, } from "../src/utils";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const ROOT = resolve(__dirname, "..",);

function toJson(value: unknown,): string {
  const result = safeJsonStringify(value, 2,);
  return result.ok ? result.value : "{}";
}

// ── JSON Schema ──────────────────────────────────────────────

const jsonSchemaPath = resolve(ROOT, "schemas/loop-lore-config.schema.json",);
const newJsonSchemaStr = toJson(ConfigSchema.jsonSchema(),);

// ── ENV_MAP snapshot ─────────────────────────────────────────

const envMapPath = resolve(ROOT, "schemas/env-map.snapshot.json",);
const newEnvMapStr = toJson(ConfigSchema.envMap(),);

// ── Compare and report ───────────────────────────────────────

let stale = false;

function checkFile(path: string, content: string, label: string,): void {
  if (!existsSync(path,)) {
    console.log(`⚠ ${label} does not exist — regenerating`,);
    writeFileSync(path, content,);
    stale = true;
    return;
  }

  const existing = readFileSync(path, "utf8",);
  if (existing.trimEnd() !== content.trimEnd()) {
    console.log(`✗ ${label} is STALE — needs regeneration`,);
    stale = true;
  } else {
    console.log(`✓ ${label} is up-to-date`,);
  }
}

checkFile(jsonSchemaPath, newJsonSchemaStr, "JSON Schema",);
checkFile(envMapPath, newEnvMapStr, "ENV_MAP snapshot",);

if (stale) {
  console.log("\nRegenerate with: bun run schemas:check:fix",);
  process.exit(1,);
}

console.log("\nAll schemas up-to-date.",);
