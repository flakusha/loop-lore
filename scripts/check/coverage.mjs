#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage reporter: parse .tmp/coverage/lcov.info, emit per-module line %
 *
 * Usage:
 *   bun run scripts/check/coverage.mjs [--floor 80]
 *
 * Per-module waivers live in `./coverage/waivers.mjs`. A waived module uses
 * its own `floor` (override) and emits a clear "WAIVED" line in the report
 * so reviewers can see exactly which modules are below the global floor
 * and why. Adding an entry requires a tracked ticket; remove the entry
 * when the module recovers.
 *
 * Modules are identified by the top-level directory under `src/` (e.g.
 * `frontend`, `tests`, `server`). Top-level source files (e.g.
 * `src/elysia-app.ts`) are grouped under the `(root)` bucket, which is
 * matchable via `--only=(root)`.
 */
import { existsSync, } from "node:fs";

import {
  integer,
  object,
  option,
  optional,
  runScript,
  string,
  withDefault,
} from "../../src/cli/parser";
import { runDiffFileMode, } from "./coverage/diff-mode.mjs";
import { aggregateModules, parseRecords, } from "./coverage/lcov.mjs";
import { WAIVERS, } from "./coverage/waivers.mjs";

const args = runScript(
  object({
    floor: withDefault(option("--floor", integer(),), 80,),
    only: optional(option("--only", string(),),),
    files: optional(option("--files", string(),),),
    coverageDir: optional(option("--coverage-dir", string(),),),
  },),
  {
    programName: "coverage",
    brief: "Report per-module line coverage from an lcov.info file against a floor.",
    showDefault: true,
    help: "option",
  },
);
const floor = args.floor;
const onlyArg = args.only;
// BUG-37a3763: diff-scoped runs previously passed `--only=<modules>` and
// floored whole-module aggregates computed from a PARTIAL lcov (bun only
// emits records for files the scoped tests actually loaded). Scoped runs
// can never reach module-level floors, so the gate was structurally
// unpassable. The scoped runner now passes `--files=<changed src files>`
// instead: each diff-touched non-test file that appears in lcov is floored
// individually (module waivers still set that file's floor); files absent
// from lcov were never loaded and are reported as SKIP (unmeasured).
const filesArg = args.files;
const diffFiles = filesArg
  ? filesArg.split(",",).map((s,) => s.trim()).filter(Boolean,)
  : null;
// Module-scoped runs floor only the touched modules (see AGENTS.md Verification
// Gates + check-parallel.mjs `changedModules`). Empty/absent --only disables
// the filter and floors every module. Touched modules with no lcov rows
// (e.g. `scripts/`, never loaded in-process) are reported as unmeasured and
// skipped — failing on unobservable data would be false red.
const onlySet = onlyArg ? new Set(onlyArg.split(",",).map((s,) => s.trim()).filter(Boolean,),) : null;
// `check-parallel.mjs` writes lcov into a per-RUN dir (`.tmp/run-<RUN_ID>/coverage/`)
// so concurrent and successive runs do not clobber each other. The runner
// passes the matching `--coverage-dir=<dir>`; we resolve `lcov.info` inside
// that directory. Falls back to the legacy `.tmp/coverage/` path for manual
// `bun run scripts/check/coverage.mjs` invocations outside the runner.
const coverageDir = args.coverageDir ??
  process.env.COVERAGE_DIR ??
  ".tmp/coverage";
const lcovPath = `${coverageDir.replace(/\/+$/, "",)}/lcov.info`;
if (!existsSync(lcovPath,)) {
  console.error(`lcov not found at ${lcovPath} - run 'bun test --coverage' first`,);
  process.exit(1,);
}

/**
 * Resolve the effective floor for a module. Defaults to the global --floor.
 * Per-file overrides take precedence: keys of the form "<mod>:<file>" floor
 * one file individually without lowering the module-wide bar.
 * @param mod
 * @param file - repo-relative path (diff-file mode only). Unused in module mode.
 */
function floorFor(mod, file,) {
  if (file) {
    const fw = WAIVERS[`${mod}:${file}`];
    if (fw) { return fw.floor; }
  }
  const w = WAIVERS[mod];
  return w ? w.floor : floor;
}

const records = parseRecords(lcovPath,);
const waivedSet = new Set(Object.keys(WAIVERS,),);

// ── Diff-file mode (--files=): floor each touched file individually ──
if (diffFiles) {
  runDiffFileMode({ diffFiles, records, floor, floorFor, },);
}

const modules = aggregateModules(records,);
const rows = Object.entries(modules,)
  .map(([m, v,],) => ({ mod: m, pct: v.lf ? (v.lh / v.lf) * 100 : 0, lf: v.lf, lh: v.lh, waived: !!WAIVERS[m], }))
  .sort((a, b,) => a.pct - b.pct);

console.error("\n| module | line % | lines hit / total | floor | status |",);
console.error("|---|---|---|---|---|",);
for (const r of rows) {
  const effectiveFloor = floorFor(r.mod,);
  const status = r.waived ? "WAIVED" : (r.pct >= effectiveFloor ? "ok" : "FAIL");

  console.error(`| ${r.mod} | ${r.pct.toFixed(1,)}% | ${r.lh}/${r.lf} | ${effectiveFloor}% | ${status} |`,);
}

const inScope = (mod,) => !onlySet || onlySet.has(mod,);
const fails = rows.filter((r,) => inScope(r.mod,) && !waivedSet.has(r.mod,) && r.pct < floor);
// Surfaced separately: waived modules below global floor but passing their own floor
const waivedBelow = rows.filter((r,) => waivedSet.has(r.mod,) && r.pct < floor);
const unmeasured = onlySet ? [...onlySet,].filter((m,) => !waivedSet.has(m,) && !rows.some((r,) => r.mod === m)) : [];
for (const m of unmeasured) {
  console.error(`| ${m} | n/a (unmeasured) | 0/0 | ${floor}% | SKIP |`,);
}
console.log(JSON.stringify({
  floor,
  only: onlySet ? [...onlySet,] : null,
  total: rows.length,
  fail: fails.length,
  unmeasured,
  waivedBelowGlobal: waivedBelow.length,
  waivers: WAIVERS,
  modules: rows,
},),);
process.exit(fails.length ? 1 : 0,);
