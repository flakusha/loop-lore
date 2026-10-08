#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * API reference drift gate — `docs/reference/api.md` vs the generated spec.
 *
 * Two independent descriptions of one surface, maintained by hand and by
 * generator, with nothing reconciling them. Measured on 2026-10-07: api.md
 * documented 147 operations, of which 14 did not exist in the spec — the
 * correcting diff is 9 insertions against 29 deletions, and those two numbers
 * are the whole shape of the damage. Nine were the WRONG HTTP VERB on a path
 * that does exist (`PUT /messages/:id/archive` where the server serves `POST`),
 * which sends a consumer following the reference to a 405, and each is exactly
 * one of the nine inserted lines. Five were not routes at all (`GET
 * /chats/:id/vn-choices/history` among them) and vanished as whole sections.
 * Nothing caught any of it: the generator only ran when someone typed
 * `bun run openapi`.
 *
 * Two invariants, both BLOCKING:
 *
 *   1. No phantom. Every operation api.md documents must exist in the spec at
 *      the same method AND path. This is the direction that is actually
 *      enforceable — it is bounded by the doc's own size, and it is the one
 *      that breaks callers.
 *   2. Ratchet. The set of spec paths api.md covers may only grow: every path
 *      in `api-doc-drift-baseline.json` must still be documented. Without this,
 *      deleting a section is indistinguishable from fixing drift, and coverage
 *      erodes silently. Regenerate with `--update-baseline` after documenting
 *      more surface.
 *
 * The reverse direction (spec operations with no api.md section — 660 of 807 at
 * the time of writing) is REPORTED, never enforced: it is a 492-path backlog,
 * not a regression, and a gate that starts red is a gate that gets ignored.
 * That backlog is the honest cost of keeping the prose; closing it is the epic's
 * own work, not this gate's.
 *
 * Path syntax differs between the two documents and must be normalised before
 * comparing: Elysia registers `:id`, OpenAPI emits `{id}`.
 *
 * Usage: bun run scripts/check/api-doc-drift.mjs [--update-baseline]
 *
 * Exit codes: 0 in sync, 1 drift found, 2 tooling failure.
 */
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);
const SPEC_REL = "docs/reference/openapi.json";
const DOC_REL = "docs/reference/api.md";
const BASELINE_REL = "scripts/check/api-doc-drift-baseline.json";
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options",];
const UPDATE_BASELINE = process.argv.includes("--update-baseline",);

/** `GET /api/v1/chats/:id/messages` -> `GET /api/v1/chats/{id}/messages`. */
const normalize = (p,) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}",);

/** Every `METHOD /api/v1/...` endpoint named in the markdown, normalized. */
function documentedOperations(markdown,) {
  const found = new Map();
  const re = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/api\/v1\/[^\s`"')|]*)/g;
  for (const [, method, raw,] of markdown.matchAll(re,)) {
    const path = normalize(raw.split("?",)[0].replace(/[.,;`]+$/, "",),);
    if (path === "/api/v1") { continue; }
    found.set(`${method} ${path}`, path,);
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

async function main() {
  const spec = await generateSpec();
  const markdown = await Bun.file(path.join(PROJECT_ROOT, DOC_REL,),).text();
  const documented = documentedOperations(markdown,);

  const specPaths = new Map();
  for (const [p, item,] of Object.entries(spec.paths ?? {},)) {
    if (p.startsWith("/api/v1",)) { specPaths.set(p, METHODS.filter((m,) => item[m]),); }
  }

  const missing = [];
  for (const op of documented.keys()) {
    const sp = op.indexOf(" ",);
    const path = op.slice(sp + 1,);
    const entry = specPaths.get(path,);
    if (!entry) { missing.push(`${op}  — path not served`,); }
    else if (!entry.includes(op.slice(0, sp,).toLowerCase(),)) {
      missing.push(`${op}  — path serves [${entry.join(", ",)}]`,);
    }
  }

  const covered = new Set([...documented.values(),].filter((p,) => specPaths.has(p,)),);
  const baselinePath = path.join(PROJECT_ROOT, BASELINE_REL,);
  const baselineFile = Bun.file(baselinePath,);
  // Fail closed on a missing baseline. Treating it as an empty baseline would
  // pass with `ratchet baseline 0`, silently disabling invariant 2 — deleting
  // the file would turn the coverage check off, which is the same "gate that
  // cannot fail" this gate exists to prevent. Only --update-baseline may
  // create it.
  if (!(await baselineFile.exists()) && !UPDATE_BASELINE) {
    throw new Error(`${BASELINE_REL} is missing — create it with --update-baseline`,);
  }
  const baseline = await baselineFile.exists()
    ? [...JSON.parse(await baselineFile.text(),).coveredPaths,]
    : [];
  const regressed = baseline.filter((p,) => !covered.has(p,)).sort();

  console.log(
    `api - doc drift: ${documented.size} documented operations; ` +
      `${covered.size}/${specPaths.size} /api/v1 spec paths documented ` +
      `(ratchet baseline ${baseline.length})`,
  );

  if (UPDATE_BASELINE) {
    await Bun.write(
      baselinePath,
      `${JSON.stringify({ coveredPaths: [...covered,].sort(), }, null, 2,)}\n`,
    );
    console.log(`  baseline updated: ${covered.size} paths -> ${BASELINE_REL}`,);
  }

  const failed = missing.length > 0 || regressed.length > 0;
  if (missing.length > 0) {
    console.log(`  ${missing.length} operation(s) documented in ${DOC_REL} but absent from the spec:`,);
    for (const line of missing) { console.log(`    ${line}`,); }
  }
  if (regressed.length > 0) {
    console.log(`  ${regressed.length} path(s) lost documented coverage:`,);
    for (const p of regressed) { console.log(`    ${p}`,); }
  }
  if (failed) {
    console.log(
      "Fix the doc entries above (or remove routes that no longer exist). " +
        "If the removal was intended, run with --update-baseline.",
    );
    process.exit(1,);
  }
  console.log("  no drift",);
}

try {
  await main();
} catch (error) {
  console.error("api - doc drift gate failed:", error.message,);
  process.exit(2,);
}
