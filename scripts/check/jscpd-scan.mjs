#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The ONE jscpd scan definition: the ignore list and the flag builder.
 *
 * The jscpd gate (`scripts/check/parallel/gates.mjs`) and the `jscpd` /
 * `jscpd:full` package.json scripts each carried their OWN ignore list, and
 * they drifted apart: dev's commit 74336a7fb widened only package.json's list,
 * so the gate went on measuring a scan nobody had fixed. At that commit the
 * gate counted 3408 clones against the 3228 baseline (FAIL) while the SAME
 * scan with package.json's list counted 2963 (OK) — the gate was grading a
 * different scan than the one that was repaired. One list, read by both, is
 * the only way they cannot diverge again.
 *
 * package.json scripts are static strings and cannot import a module, so they
 * call this file as a CLI:
 *
 *   bun scripts/check/jscpd-scan.mjs --min-lines 8 --min-tokens 100
 *   bun scripts/check/jscpd-scan.mjs --min-lines 4 --min-tokens 30 \
 *     --reporters console,json --output .tmp/jscpd
 *
 * The gate builds its command string from the same exports, so gate and
 * scripts measure one scan.
 */
import path from "node:path";
import { integer, object, option, optional, runScript, string, withDefault, } from "../../src/cli/parser";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/**
 * Paths excluded from every jscpd scan: generated code, vendored assets and
 * the non-TypeScript front-end templates. `scripts/check/test-gaps.mjs`
 * (SKIP_PATTERNS) mirrors this list for the coverage gate.
 */
export const JSCPD_IGNORE = [
  "**/*.test.ts",
  "**/migrations/*",
  "**/public/**",
  "**/schema-manifest.ts",
  "**/db-schemas.ts",
  "**/insert-helpers.ts",
  "**/views/*.html",
  "frontend/alpine/**",
  "validation/schemas/*",
  "db/schema-*.ts",
];

/**
 * The jscpd argument vector for one scan. `reporters` and `output` are
 * optional: the `jscpd` script runs with the tool's own defaults.
 *
 * @param {{ minLines: number, minTokens: number, reporters?: string, output?: string, }} opts
 *   the scan's flags
 * @returns {string[]} the arguments for the jscpd binary
 */
export function jscpdScanArgs({ minLines, minTokens, reporters, output, },) {
  const args = [
    "jscpd",
    "src/",
    "--min-lines",
    String(minLines,),
    "--min-tokens",
    String(minTokens,),
    "--ignore",
    JSCPD_IGNORE.join(",",),
  ];
  if (reporters) { args.push("--reporters", reporters,); }
  if (output) { args.push("--output", output,); }
  return args;
}

/** Quote a shell argument that carries a comma or a space. */
function shellQuote(arg,) {
  return /[,\s'"]/.test(arg,) ? `'${arg.replaceAll("'", "'\\''",)}'` : arg;
}

/**
 * The same scan as a shell command string — the form the gate runs through
 * `bash -c`. Built from {@link jscpdScanArgs}, so the command and the CLI
 * cannot describe different scans.
 *
 * @param {{ minLines: number, minTokens: number, reporters?: string, output?: string, }} opts
 *   the scan's flags
 * @returns {string} the shell command
 */
export function jscpdScanCommand(opts,) {
  return `bunx ${jscpdScanArgs(opts,).map(shellQuote,).join(" ",)}`;
}

function parseArgs() {
  return runScript(
    object({
      minLines: withDefault(option("--min-lines", integer(),), 4,),
      minTokens: withDefault(option("--min-tokens", integer(),), 30,),
      reporters: optional(option("--reporters", string(),),),
      output: optional(option("--output", string(),),),
    },),
    {
      programName: "jscpd-scan",
      brief: "Run the repo's shared jscpd scan (one ignore list for the gate and the package.json scripts).",
      examples:
        "jscpd-scan --min-lines 8 --min-tokens 100   # the `jscpd` script's scan\n  jscpd-scan --min-lines 4 --min-tokens 30 --reporters console,json --output .tmp/jscpd",
      help: "option",
    },
  );
}

// Guarded so importing this module (the colocated test) cannot run the scan
// against the importer's argv.
if (import.meta.main) {
  const opts = parseArgs();
  const proc = Bun.spawnSync(["bunx", ...jscpdScanArgs(opts,),], {
    cwd: PROJECT_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  },);
  process.exit(proc.exitCode,);
}
