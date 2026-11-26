#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CI guard on gate-run provenance: the `check:ci` report must claim the full
 * profile, zero profile-induced skips, and the LIVE registry's gate count.
 * A profile flag leaking into CI would otherwise shrink the suite silently.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { readFileSync, } from "node:fs";
import { REPORT_PATH, } from "../check/parallel/config.mjs";
import { checks, } from "../check/parallel/gates.mjs";

const report = JSON.parse(readFileSync(REPORT_PATH, "utf8",),);
// gates.mjs is the assembled registry (static table + runtime-registered test
// chunks, jscpd and weave), so this count tracks additions without a literal.
const registrySize = Object.keys(checks,).length;
const problems = [];

if (report.profile !== "full") {
  problems.push(`profile=${JSON.stringify(report.profile,)} (expected "full")`,);
}
if (!Array.isArray(report.skippedByProfile,) || report.skippedByProfile.length > 0) {
  problems.push(
    `skippedByProfile=${JSON.stringify(report.skippedByProfile,)} (expected [])`,
  );
}
if (report.summary?.total !== registrySize) {
  problems.push(
    `summary.total=${report.summary?.total} (expected ${registrySize} live gates)`,
  );
}

if (problems.length > 0) {
  console.error("error: check:ci did not run the full gate registry:",);
  for (const problem of problems) { console.error(`  ${problem}`,); }
  process.exit(1,);
}
console.log(
  `check-profile-provenance: profile=full, 0 profile skips, ${registrySize} gates`,
);
