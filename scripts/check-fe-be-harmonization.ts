#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * FE-BE harmonization check.
 *
 * Joins frontend API calls against Elysia routes + TypeBox schemas.
 * Blocking: FE call with no BE route, method mismatch, unknown body/query
 * key, missing required body key (when the FE body literal is visible).
 * Advisory while triage is open: factory-built routes (createEntityRoutes
 * parentPrefix/entityPath) and guarded/group-mounted paths are invisible to
 * the literal scan and surface as FE-no-BE until taught. Promote to blocking
 * once triage clears or allowlists the classes below.
 *
 * Run: `bun run scripts/check-fe-be-harmonization.ts`
 */

import { mkdirSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { scanBe, } from "./fe-be-harmonization/be-routes";
import { scanFe, } from "./fe-be-harmonization/fe-calls";
import { scanSchemas, } from "./fe-be-harmonization/schemas";
import { REPORT, samePath, } from "./fe-be-harmonization/shared";

const fe = scanFe();
const be = scanBe();
const schemas = scanSchemas();
const blocking: string[] = [];
const advisory: string[] = [];

for (const c of fe) {
  const same = be.filter((r,) => samePath(r.path, c.path,));
  if (same.length === 0) {
    blocking.push(
      `${c.file}:${c.line} [blocking] FE-no-BE: ${c.method} ${c.raw} — no backend route; add route or fix URL.`,
    );
    continue;
  }
  if (!same.some((r,) => r.method === c.method)) {
    blocking.push(
      `${c.file}:${c.line} [blocking] method mismatch: FE ${c.method} ${c.raw} vs BE ${
        same.map((r,) => r.method).join("/",)
      }; align method.`,
    );
  }
  const route = same.find((r,) => r.method === c.method) ?? same[0]!;
  const checkKeys = (keys: string[], schemaName: string | null, kind: string,): void => {
    if (!schemaName || keys.length === 0) { return; }
    const s = schemas.get(schemaName,);
    if (!s) { return; }
    for (const key of keys) {
      if (!s.required.includes(key,) && !s.optional.includes(key,)) {
        blocking.push(
          `${c.file}:${c.line} [blocking] unknown ${kind} key "${key}" for ${c.method} ${c.raw} (schema ${schemaName}); remove flag or extend schema.`,
        );
      }
    }
  };
  checkKeys(c.bodyKeys, route.bodySchema, "body",);
  checkKeys(c.queryKeys, route.querySchema, "query",);
  if (c.bodyKeys.length > 0 && route.bodySchema) {
    const s = schemas.get(route.bodySchema,);
    if (s) {
      for (const req of s.required) {
        if (!c.bodyKeys.includes(req,)) {
          blocking.push(
            `${c.file}:${c.line} [blocking] missing required "${req}" for ${c.method} ${c.raw} (schema ${route.bodySchema}); add field.`,
          );
        }
      }
    }
  }
}

for (const r of be) {
  if (!fe.some((c,) => samePath(c.path, r.path,))) {
    advisory.push(
      `${r.file}:${r.line} [advisory] BE-no-FE: ${r.method} ${r.raw} — no frontend caller (may serve TUI/curl/partner).`,
    );
  }
}

mkdirSync(path.dirname(REPORT,), { recursive: true, },);
writeFileSync(REPORT, JSON.stringify({ blocking, advisory, counts: { fe: fe.length, be: be.length, }, }, null, 2,),);
console.log("=== FE-BE harmonization ===",);
console.log(`FE calls: ${fe.length}, BE routes: ${be.length}, schemas: ${schemas.size}`,);
for (const b of blocking) { console.log(`  ${b}`,); }
for (const a of advisory.slice(0, 20,)) { console.log(`  ${a}`,); }
if (advisory.length > 20) {
  console.log(
    `  ... +${advisory.length - 20} more advisory (see .tmp/fe-be-harmony.json)`,
  );
}
if (blocking.length > 0) {
  console.log(`\nfail: ${blocking.length} blocking drift finding(s).`,);
  process.exit(1,);
}
console.log("OK: no blocking drift.",);
