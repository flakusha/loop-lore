#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lcov.info parsing helpers for the coverage reporter.
 *
 * Records are split on `end_of_record`; each record's SF/LF/LH lines feed
 * both the per-module aggregate and the per-file stat map used by
 * diff-file mode.
 */

import { readFileSync } from "node:fs";

/**
 * Parse an lcov file into its raw records.
 * @param lcovPath
 * @returns {string[]}
 */
export function parseRecords(lcovPath,) {
  const lcov = readFileSync(lcovPath, "utf8",);
  return lcov.split("end_of_record",).filter(Boolean,);
}

/**
 * Aggregate LF/LH per module (top-level dir under `src/`; top-level files
 * bucket under `(root)`).
 * @param records
 */
export function aggregateModules(records,) {
  const modules = {};

  for (const r of records) {
    const sf = r.match(/SF:(.+)/,)?.[1];

    if (!sf) { continue; }
    const seg = sf.replace(/^src\//, "",).split("/",)[0];
    const mod = seg.includes(".",) ? "(root)" : seg;
    const lf = parseInt(r.match(/LF:(\d+)/,)?.[1] || "0", 10,);

    const lh = parseInt(r.match(/LH:(\d+)/,)?.[1] || "0", 10,);

    modules[mod] = modules[mod] || { lf: 0, lh: 0, };
    modules[mod].lf += lf;
    modules[mod].lh += lh;
  }

  return modules;
}

/**
 * Per-file LF/LH map keyed by the lcov SF path (diff-file mode).
 * @param records
 */
export function perFileStats(records,) {
  const perFile = {};
  for (const r of records) {
    const sf = r.match(/SF:(.+)/,)?.[1];

    if (!sf) { continue; }
    const lf = parseInt(r.match(/LF:(\d+)/,)?.[1] || "0", 10,);

    const lh = parseInt(r.match(/LH:(\d+)/,)?.[1] || "0", 10,);

    perFile[sf] = { lf, lh, };
  }
  return perFile;
}
