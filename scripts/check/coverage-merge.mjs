#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 190

/**
 * Merge per-chunk lcov.info files into the per-RUN coverage dir for the
 * unchanged floor checker.
 *
 * The former mega coverage gate ran ONE `bun test` over the whole tree, so
 * `.tmp/run-<id>/coverage/lcov.info` always existed as a single artifact.
 * The gate split (see `scripts/check/parallel/gates.mjs`) executes the same
 * test surface as several chunk gates, each writing its own lcov chunk into
 * the run dir; this script reassembles the exact artifact downstream code
 * expects (`CHECK_REPORT_COVERAGE_LCOV`, `coverage.mjs --floor=80`).
 *
 * Merge rules, deterministic:
 *   - SF paths are already repo-relative (every chunk runs from the repo
 *     root), so the same module measured by two chunks (e.g. a service
 *     loaded by both the unit and the e2e chunk) is ONE file measured
 *     twice. DA lines merge by MAX hits per line — a line is covered when
 *     ANY execution covers it — and LH/LF are recounted from the merged DA
 *     set. BRDA/FN/FNDA follow the same union rule (max taken, recount).
 *   - Records sort by SF so the merged file is byte-stable across runs.
 *
 * A chunk whose lcov.info does not exist is a hard error naming the chunk:
 * a skipped or crashed chunk gate must fail this gate loudly, or the floor
 * would silently compute from a partial suite — exactly the false green the
 * gate split was structured to avoid.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from "node:fs";
import path from "node:path";
import {
  flag,
  object,
  option,
  runScript,
  string,
  withDefault,
} from "../../src/cli/parser";

const args = runScript(
  object({
    chunks: option("--chunks", string(),), // comma-separated lcov file paths
    out: option("--out", string(),), // merged lcov.info destination path
    dryRun: withDefault(flag("--dry-run",), false,), // parse + report only, write nothing
  },),
  {
    programName: "coverage-merge",
    brief: "Merge per-chunk lcov.info files into one artifact for the floor gate.",
    help: "option",
  },
);

const chunkPaths = args.chunks.split(",",).map((s,) => s.trim()).filter(Boolean,);
if (chunkPaths.length === 0) {
  console.error("error: --chunks named no lcov files",);
  process.exit(2,);
}

/**
 * Parse one lcov file into per-SF records with union-mergeable hit maps.
 * A missing file exits 1: the chunk gate was skipped or died early, and a
 * floor computed from the remaining chunks would be a false green.
 */
function parseChunk(lcovPath, chunkName,) {
  if (!existsSync(lcovPath,)) {
    console.error(`error: chunk lcov missing: ${chunkName} (${lcovPath})`,);
    console.error(
      "The chunk gate was skipped or crashed without producing coverage; the floor cannot be computed from a partial suite.",
    );
    process.exit(1,);
  }
  const text = readFileSync(lcovPath, "utf8",);
  const records = [];
  for (const raw of text.split("end_of_record",)) {
    const sf = raw.match(/^SF:(.+)$/m,)?.[1];
    if (!sf) { continue; }
    const da = new Map();
    for (const m of raw.matchAll(/^DA:(\d+),(\d+)/gm,)) {
      const line = Number(m[1],);
      const hits = Number(m[2],);
      da.set(line, Math.max(da.get(line,) ?? 0, hits,),);
    }
    // "line,block,branch" -> taken hits (max); "-" taken means never taken.
    const br = new Map();
    for (const m of raw.matchAll(/^BRDA:(\d+),(\d+),(\d+),(-?\d+)$/gm,)) {
      const key = `${m[1]},${m[2]},${m[3]}`;
      const taken = m[4] === "-" ? 0 : Number(m[4],);
      br.set(key, Math.max(br.get(key,) ?? 0, taken,),);
    }
    const fn = []; // FN line,name — first-seen order per file
    const fnda = new Map(); // name -> hits (max)
    for (const m of raw.matchAll(/^FN:(\d+),(.+)$/gm,)) { fn.push([Number(m[1],), m[2],],); }
    for (const m of raw.matchAll(/^FNDA:(\d+),(.+)$/gm,)) {
      const name = m[2];
      fnda.set(name, Math.max(fnda.get(name,) ?? 0, Number(m[1],),),);
    }
    records.push({ sf, da, br, fn, fnda, },);
  }
  return records;
}

/** Merge all chunks: SF-keyed union with max-hit DA/BRDA/FNDA semantics. */
function mergeRecords(chunkRecords,) {
  const bySf = new Map();
  for (const records of chunkRecords) {
    for (const rec of records) {
      const cur = bySf.get(rec.sf,);
      if (!cur) {
        bySf.set(rec.sf, rec,);
        continue;
      }
      for (const [line, hits,] of rec.da) {
        cur.da.set(line, Math.max(cur.da.get(line,) ?? 0, hits,),);
      }
      for (const [key, taken,] of rec.br) {
        cur.br.set(key, Math.max(cur.br.get(key,) ?? 0, taken,),);
      }
      for (const [line, name,] of rec.fn) {
        if (!cur.fn.some(([l, n,],) => l === line && n === name)) { cur.fn.push([line, name,],); }
      }
      for (const [name, hits,] of rec.fnda) {
        cur.fnda.set(name, Math.max(cur.fnda.get(name,) ?? 0, hits,),);
      }
    }
  }
  return [...bySf.values(),].sort((a, b,) => a.sf < b.sf ? -1 : a.sf > b.sf ? 1 : 0);
}

function renderRecord(rec,) {
  const lines = [`SF:${rec.sf}`,];
  for (const [line, name,] of rec.fn) { lines.push(`FN:${line},${name}`,); }
  for (const [name, hits,] of rec.fnda) { lines.push(`FNDA:${hits},${name}`,); }
  lines.push(`FNF:${rec.fn.length}`,);
  lines.push(`FNH:${rec.fnda.size}`,);
  for (const [key, taken,] of rec.br) { lines.push(`BRDA:${key},${taken}`,); }
  if (rec.br.size > 0) {
    lines.push(`BRF:${rec.br.size}`,);
    lines.push(`BRH:${[...rec.br.values(),].filter((t,) => t > 0).length}`,);
  }
  for (const [line, hits,] of [...rec.da,].sort((a, b,) => a[0] - b[0])) {
    lines.push(`DA:${line},${hits}`,);
  }
  lines.push(`LF:${rec.da.size}`,);
  lines.push(`LH:${[...rec.da.values(),].filter((h,) => h > 0).length}`,);
  lines.push("end_of_record",);
  return lines.join("\n",);
}

const chunkRecords = chunkPaths.map((p, i,) => parseChunk(p, `chunk ${i + 1}/${chunkPaths.length}`,));
const merged = mergeRecords(chunkRecords,);
const totalLf = merged.reduce((s, r,) => s + r.da.size, 0,);
const totalLh = merged.reduce((s, r,) => s + [...r.da.values(),].filter((h,) => h > 0).length, 0,);
console.log(
  `coverage-merge: ${chunkPaths.length} chunks -> ${merged.length} files, LH/LF ${totalLh}/${totalLf} (${
    ((totalLh / Math.max(totalLf, 1,)) * 100).toFixed(1,)
  }%)`,
);

if (args.dryRun) { process.exit(0,); }

const outPath = path.resolve(args.out,);
mkdirSync(path.dirname(outPath,), { recursive: true, },);
const body = merged.map(renderRecord,).join("\n",) + "\n";
// Atomic publish: write a sibling temp then rename, so the floor checker
// never reads a half-written lcov.
const tmpPath = `${outPath}.tmp-${process.pid}`;
writeFileSync(tmpPath, body,);
renameSync(tmpPath, outPath,);
console.log(`coverage-merge: wrote ${outPath}`,);
