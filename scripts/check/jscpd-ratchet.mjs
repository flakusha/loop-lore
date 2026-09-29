#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * jscpd ratchet gate — fails when the clone count grows past the committed
 * baseline, so the advisory "N clones every run" warning becomes actionable.
 *
 * Usage:
 *   bun scripts/check/jscpd-ratchet.mjs --report <jscpd-report.json> [--baseline <path>] [--update]
 *
 * - Gate mode (default): exit 1 when `duplicates.length > baseline.clones`.
 * - `--update`: lower the baseline to the current count; refuses to raise.
 *   Only ever run this intentionally after removing duplication.
 *
 * The baseline number lives only in `scripts/check/jscpd-baseline.json` —
 * never quote it in docs (docs-no-volatile-metrics).
 */
import { readFileSync, writeFileSync, } from "node:fs";
import path from "node:path";

const DEFAULT_BASELINE = path.join(import.meta.dir, "jscpd-baseline.json",);

function parseArgs(argv,) {
  const args = { report: null, baseline: DEFAULT_BASELINE, update: false, };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--report" && argv[i + 1] !== undefined) {
      args.report = argv[i + 1];
      i++;
    } else if (argv[i] === "--baseline" && argv[i + 1] !== undefined) {
      args.baseline = argv[i + 1];
      i++;
    } else if (argv[i] === "--update") {
      args.update = true;
    }
  }
  return args;
}

function readClones(reportPath,) {
  const report = JSON.parse(readFileSync(reportPath, "utf8",),);
  const clones = report.duplicates.length;
  if (!Number.isInteger(clones,) || clones < 0) {
    throw new Error(`report has no usable duplicates[]: ${reportPath}`,);
  }
  return clones;
}

function readBaseline(baselinePath,) {
  const raw = JSON.parse(readFileSync(baselinePath, "utf8",),);
  const clones = raw.clones;
  if (!Number.isInteger(clones,) || clones < 0) {
    throw new Error(`baseline has no integer clones field: ${baselinePath}`,);
  }
  return clones;
}

function main() {
  const args = parseArgs(process.argv.slice(2,),);
  if (!args.report) {
    console.error("usage: jscpd-ratchet.mjs --report <jscpd-report.json> [--baseline <path>] [--update]",);
    process.exit(2,);
  }
  const baselinePath = path.resolve(args.baseline,);
  const clones = readClones(path.resolve(args.report,),);
  if (args.update) {
    const baseline = readBaseline(baselinePath,);
    if (clones >= baseline) {
      console.error(
        `refusing to update baseline: current ${clones} clones >= baseline ${baseline} (update only lowers)`,
      );
      process.exit(1,);
    }
    writeFileSync(
      baselinePath,
      `${JSON.stringify({ clones, }, null, 2,)}\n`,
      "utf8",
    );
    console.log(`jscpd baseline lowered: ${baseline} → ${clones} (${baselinePath})`,);
    return;
  }
  const baseline = readBaseline(baselinePath,);
  if (clones > baseline) {
    console.error(
      `FAIL: jscpd ratchet: ${clones} clones exceeds baseline ${baseline}`,
    );
    console.error(
      `  Deduplicate the new clones, or lower the baseline intentionally:`,
    );
    console.error(
      `  bun scripts/check/jscpd-ratchet.mjs --report <report.json> --update`,
    );
    process.exit(1,);
  }
  console.log(`OK: jscpd ratchet: ${clones} clones (baseline ${baseline})`,);
  if (clones < baseline) {
    console.log(
      `  Lower the baseline: bun scripts/check/jscpd-ratchet.mjs --report <report.json> --update`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`FAIL: jscpd ratchet: ${error.message}`,);
  process.exit(1,);
}
