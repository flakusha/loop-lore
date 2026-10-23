#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * FE-BE harmonization check.
 *
 * Joins frontend API calls against Elysia routes + TypeBox schemas.
 * BLOCKING (`"fe-be - harmony"` in `scripts/check/parallel/gate-table.mjs`):
 * FE call with no BE route, method mismatch, unknown body/query key, and a
 * body literal missing a required key. The gate reports zero blocking
 * findings on dev (468 FE calls / 903 BE routes), so the "advisory while
 * triage is open" caveat no longer holds: factory-built (createEntityRoutes)
 * and guarded/group-mounted paths do not surface as FE-no-BE drift today.
 * Revisit if a refactor makes them. BE-no-FE stays advisory — a route may
 * serve the TUI, curl, or a partner.
 *
 * Output contract: findings only, plus one summary line adjacent to them; a
 * clean run prints nothing (the check report's pass row carries the verdict).
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
/** Advisory findings echoed to stdout on failure; the full set lives in REPORT. */
const ADVISORY_PREVIEW = 20;
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
// AC5: stdout carries findings only — no banner, no success line. The summary
// line sits adjacent to the findings it counts.
if (blocking.length > 0) {
  console.log(
    `fe-be - harmony: ${blocking.length} blocking finding(s), ${advisory.length} advisory ` +
      `(${fe.length} FE calls / ${be.length} BE routes / ${schemas.size} schemas)`,
  );
  for (const b of blocking) { console.log(`  ${b}`,); }
  for (const a of advisory.slice(0, ADVISORY_PREVIEW,)) { console.log(`  ${a}`,); }
  if (advisory.length > ADVISORY_PREVIEW) {
    console.log(`  ... +${advisory.length - ADVISORY_PREVIEW} more advisory (see ${REPORT})`,);
  }
  process.exit(1,);
}
