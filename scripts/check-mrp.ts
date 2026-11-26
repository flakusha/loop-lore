#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Wrap the last `bun run check` report in a deterministic MRP. */

// oxlint-disable-next-line import/no-nodejs-modules
import { mkdirSync, readFileSync, writeFileSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

import { buildMrp, type CheckReport, } from "../src/check/mrp";
import { canonicalJSON, } from "../src/hash/record-hash";

const root = process.cwd();
const reportPath = path.resolve(root, ".tmp/check-report.json",);
const outPath = path.resolve(root, ".tmp/check-report.mrp.json",);
const report = JSON.parse(readFileSync(reportPath, "utf8",),) as CheckReport;
const mrp = buildMrp(report,);

mkdirSync(path.dirname(outPath,), { recursive: true, },);
writeFileSync(outPath, `${canonicalJSON(mrp,)}\n`, "utf8",);
console.log(`MRP ${mrp.verdict} ${mrp.hash} -> ${path.relative(root, outPath,)}`,);
