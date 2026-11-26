#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * API reference freshness gate — `docs/reference/api.md` vs the generated spec.
 *
 * api.md is generated now: `docs/reference/openapi.json` (gitignored, written
 * by scripts/generate-openapi.ts) is the source and scripts/generate-api-md.ts
 * renders the tables. This gate regenerates both and fails when the committed
 * api.md differs — the same regenerate-and-diff shape as the other generated
 * artifact gates. Two invariants survive from the old hand-maintained gate:
 *
 *   1. No phantom. Every `METHOD /api/...` operation named in the markdown must
 *      exist in the spec at the same method AND path. The table is generated,
 *      so this passes by construction — but it still catches a hand-edit that
 *      smuggles a fictitious route into the preserved prose region.
 *   2. OpenAPI validity. The regenerated spec must be well-formed OpenAPI 3.1
 *      with at least one path. A malformed or empty spec would render an empty
 *      table and could otherwise pass a pure diff unnoticed.
 *
 * The coverage ratchet is gone: api.md no longer curates a subset of the spec,
 * so "documented paths may only grow" has nothing left to measure. Operations
 * without a summary/description are counted in the output, never papered over.
 *
 * Usage: bun run scripts/check/api-doc-drift.mjs
 *
 * Exit codes: 0 in sync, 1 drift found, 2 tooling failure.
 */
import path from "node:path";
import { object, runScript, } from "../../src/cli/parser";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);
const SPEC_REL = "docs/reference/openapi.json";
const DOC_REL = "docs/reference/api.md";
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace",];

runScript(object({},), {
  programName: "api-doc-drift",
  brief: "Fail when docs/reference/api.md is stale versus the generated OpenAPI spec.",
  help: "option",
},);

/** Elysia emits `{id}` where the old prose wrote `:id`. */
const normalize = (p,) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}",);

/** Every `METHOD /api/...` endpoint named in the markdown, normalized. */
function documentedOperations(markdown,) {
  const found = new Map();
  const re = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|?\s*(\/api\/[^\s`"')|]*)/g;
  for (const [, method, raw,] of markdown.matchAll(re,)) {
    const apiPath = normalize(raw.split("?",)[0].replace(/[.,;`]+$/, "",),);
    if (apiPath === "/api") { continue; }
    found.set(`${method} ${apiPath}`, apiPath,);
  }
  return found;
}

/** Regenerate the spec through the shipped generator so the gate never reads a stale artifact. */
async function generateSpec() {
  const proc = Bun.spawnSync(
    ["bun", "run", "scripts/generate-openapi.ts",],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: "development", },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (proc.exitCode !== 0) {
    throw new Error(
      `generate-openapi.ts exited ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr,).trim()}`,
    );
  }
  const file = Bun.file(path.join(PROJECT_ROOT, SPEC_REL,),);
  if (!(await file.exists())) { throw new Error(`${SPEC_REL} was not produced`,); }
  return file.json();
}

/** Render api.md from the freshly generated spec before diffing it. */
function generateDoc() {
  const proc = Bun.spawnSync(
    ["bun", "run", "scripts/generate-api-md.ts",],
    { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe", },
  );
  if (proc.exitCode !== 0) {
    throw new Error(
      `generate-api-md.ts exited ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr,).trim()}`,
    );
  }
}

async function main() {
  const spec = await generateSpec();

  // Invariant 2: valid OpenAPI 3.1 with at least one path.
  if (
    !spec.openapi?.startsWith("3.1",) || typeof spec.paths !== "object" || spec.paths === null ||
    Object.keys(spec.paths,).length === 0
  ) {
    console.error(
      "api - doc drift: spec is not valid OpenAPI 3.1 with paths — openapi=" + JSON.stringify(spec.openapi,) +
        ", paths type=" + typeof spec.paths + ", count=" + Object.keys(spec.paths ?? {},).length,
    );
    process.exit(1,);
  }

  const specPaths = new Map();
  for (const [p, item,] of Object.entries(spec.paths ?? {},)) {
    specPaths.set(p, METHODS.filter((m,) => item[m]),);
  }

  // Invariant 1: no phantom operations in the prose or the generated table.
  const markdown = await Bun.file(path.join(PROJECT_ROOT, DOC_REL,),).text();
  const documented = documentedOperations(markdown,);
  const missing = [];
  for (const op of documented.keys()) {
    const sp = op.indexOf(" ",);
    const opPath = op.slice(sp + 1,);
    const served = specPaths.get(opPath,);
    if (!served) { missing.push(`${op}  — path not served`,); }
    else if (!served.includes(op.slice(0, sp,).toLowerCase(),)) {
      missing.push(`${op}  — path serves [${served.join(", ",)}]`,);
    }
  }
  if (missing.length > 0) {
    console.log(`  ${missing.length} operation(s) named in ${DOC_REL} but absent from the spec:`,);
    for (const line of missing) { console.log(`    ${line}`,); }
    process.exit(1,);
  }

  // Freshness: regenerate from that same spec and diff against the committed file.
  generateDoc();
  const diff = Bun.spawnSync(
    ["git", "diff", "--exit-code", "--", DOC_REL,],
    { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe", },
  );
  if (diff.exitCode !== 0) {
    console.error(`api - doc drift: ${DOC_REL} is stale — regenerated copy differs from HEAD.`,);
    console.error("Run `bun run openapi && bun run openapi:md` and commit the result.",);
    if (diff.exitCode === 1) { console.error(new TextDecoder().decode(diff.stdout,).trim(),); }
    process.exit(1,);
  }

  let hollow = 0;
  let operations = 0;
  for (const item of Object.values(spec.paths ?? {},)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) { continue; }
      operations++;
      if (!op.summary?.trim() && !op.description?.trim()) { hollow++; }
    }
  }
  console.log(
    `api - doc drift: ${operations} spec operations (${hollow} without summary/description); ` +
      `${specPaths.size} paths; ${documented.size} operations named in ${DOC_REL}; no drift`,
  );
}

try {
  await main();
} catch (error) {
  console.error("api - doc drift gate failed:", error.message,);
  process.exit(2,);
}
